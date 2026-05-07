'use strict'

const db = uniCloud.database()
const crypto = require('crypto')
const createConfigCenter = require('uni-config-center')
const _ = db.command

// ============ 配置读取 ============

function getPasswordSecret() {
  const cc = createConfigCenter({ pluginId: 'uni-id' })
  const raw = cc.config()
  let secret = ''
  if (Array.isArray(raw)) {
    const x = raw[0]
    secret = x && x.passwordSecret ? x.passwordSecret : ''
  } else {
    secret = raw && raw.passwordSecret ? raw.passwordSecret : ''
  }
  if (!secret) throw new Error('uni-id config missing passwordSecret')
  return secret
}

function getTokenSecret() {
  const cc = createConfigCenter({ pluginId: 'uni-id' })
  const raw = cc.config()
  let secret = ''
  if (Array.isArray(raw)) {
    const x = raw[0]
    secret = x && x.tokenSecret ? x.tokenSecret : ''
  } else {
    secret = raw && raw.tokenSecret ? raw.tokenSecret : ''
  }
  if (!secret) throw new Error('uni-id config missing tokenSecret')
  return secret
}

function getTokenExpiresIn() {
  const cc = createConfigCenter({ pluginId: 'uni-id' })
  const raw = cc.config()
  if (Array.isArray(raw)) {
    const x = raw[0]
    return (x && x.tokenExpiresIn) ? Number(x.tokenExpiresIn) : 7200
  }
  return (raw && raw.tokenExpiresIn) ? Number(raw.tokenExpiresIn) : 7200
}

// ============ 密码工具 ============

function encryptPwd(password) {
  const secret = getPasswordSecret()
  return crypto.createHmac('sha1', String(secret)).update(String(password)).digest('hex')
}

// ============ 自定义 Token 实现（简单随机字符串，避免 JWT 兼容性问题） ============

function createToken(uid) {
  const randomPart = crypto.randomBytes(24).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  const ts = Date.now().toString(36)
  const combined = uid + '.' + ts + '.' + randomPart
  const sig = crypto.createHmac('sha256', getTokenSecret()).update(combined).digest('hex')
  return uid + '.' + ts + '.' + randomPart + '.' + sig
}

function verifyToken(token) {
  const parts = token.split('.')
  if (parts.length !== 4) throw new Error('Invalid token format')
  const [uid, ts, randomPart, sig] = parts
  // 签名用 uid.ts.random（3段），和 createToken 保持一致
  const combined = uid + '.' + ts + '.' + randomPart
  const expectedSig = crypto.createHmac('sha256', getTokenSecret()).update(combined).digest('hex')
  if (sig !== expectedSig) throw new Error('Invalid token signature')
  const expTs = parseInt(ts, 36) + getTokenExpiresIn() * 1000
  if (Date.now() > expTs) throw new Error('Token expired')
  return { uid }
}

// 管理员 Token 校验（模块级纯函数，不依赖 this）
function adminVerifyToken(token) {
  if (!token) return { err: { errCode: 401, errMsg: '请先登录' } }
  try {
    const payload = verifyToken(token)
    if (!payload.uid) return { err: { errCode: 401, errMsg: '无效的token' } }
    return { uid: payload.uid }
  } catch (e) {
    console.error('[adminVerifyToken] verify failed:', e.message, 'token:', token ? token.substring(0, 20) + '...' : 'empty')
    if (e.message && e.message.includes('expired')) {
      return { err: { errCode: 401, errMsg: '登录已过期，请重新登录' } }
    }
    return { err: { errCode: 401, errMsg: '登录已失效: ' + (e.message || '') } }
  }
}

// ============ 参数合并（兼容 H5） ============

function mergeCloudParams(ctx, params) {
  let p = params
  if (p == null || typeof p !== 'object') p = {}
  try {
    if (typeof ctx.getParams === 'function') {
      const arr = ctx.getParams()
      if (Array.isArray(arr) && arr.length > 0) {
        const first = arr[0]
        if (first != null && typeof first === 'object') {
          return Object.assign({}, first, p)
        }
      }
    }
  } catch (e) { /* ignore */ }
  return p
}

function formatTs(ts) {
  if (ts == null) return ''
  const d = new Date(typeof ts === 'number' ? ts : Number(ts))
  if (isNaN(d.getTime())) return ''
  const beijingMs = d.getTime() + 8 * 60 * 60 * 1000
  const bj = new Date(beijingMs)
  const pad = (n) => (n < 10 ? '0' + n : '' + n)
  return bj.getFullYear() + '-' + pad(bj.getMonth() + 1) + '-' + pad(bj.getDate()) + ' ' + pad(bj.getHours()) + ':' + pad(bj.getMinutes())
}

// ============ 金额工具 ============

function centToYuan(cent) {
  if (cent == null || isNaN(Number(cent))) return '0.00'
  return (Number(cent) / 100).toFixed(2)
}

function yuanToCent(yuan) {
  if (yuan == null || isNaN(Number(yuan))) return 0
  return Math.round(parseFloat(String(yuan)) * 100)
}

function formatOrderTime(ts) {
  if (ts == null) return ''
  const d = new Date(typeof ts === 'number' ? ts : Number(ts))
  if (isNaN(d.getTime())) return ''
  const pad = (n) => (n < 10 ? '0' + n : '' + n)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

function orderStatusText(status) {
  const m = {
    pending_pay: '待付款', paid: '待发货', shipped: '待收货',
    received: '已完成', closed: '已关闭', refunding: '售后中'
  }
  return m[status] || String(status || '')
}

function mapProductDoc(doc) {
  let tag = doc.tag || ''
  if (!tag && doc.sales != null && doc.sales > 500) tag = '热卖'
  if (!tag && doc.stock != null && doc.stock > 0 && doc.stock < 30) tag = '新品'
  const cover = doc.cover || sampleProductCover(doc)
  return {
    id: doc._id, title: doc.title || '',
    priceYuan: centToYuan(doc.price_cent), tag,
    cover, stock: doc.stock != null ? doc.stock : 0,
    sales: doc.sales != null ? doc.sales : 0,
    status: doc.status || 'off',
    createdAt: formatOrderTime(doc.created_at)
  }
}

function sampleProductCover(doc) {
  const title = String(doc.title || '')
  const id = String(doc._id || '')
  if (id === 'p1' || title.indexOf('A') >= 0) return '/static/mall/products/product-a.png'
  if (id === 'p2' || title.indexOf('B') >= 0) return '/static/mall/products/product-b.png'
  if (id === 'p3' || title.indexOf('C') >= 0) return '/static/mall/products/product-c.png'
  if (id === 'p4' || title.indexOf('D') >= 0) return '/static/mall/products/product-d.png'
  return '/static/mall/products/product-a.png'
}

// ============ Mock / Fallback 数据 ============

const MOCK_STATS = {
  order7d: '1280000', pendingShip: 326, visitors7d: 1200, rating: '4.8'
}

const MOCK_ORDER_LIST = [
  { id: 'ORD' + Date.now(), order_no: 'ORD240401', g: '示例商品 A ×1', time: '2026-04-01', st: '待发货', status: 'paid', totalYuan: '99.00', phone: '138****1234', addr: '北京市 朝阳区' },
  { id: 'ORD' + (Date.now() + 1), order_no: 'ORD240328S', g: '示例商品 D ×2', time: '2026-03-28', st: '待收货', status: 'shipped', totalYuan: '398.00', phone: '139****5678', addr: '上海市浦东新区' },
  { id: 'ORD' + (Date.now() + 2), order_no: 'ORD240315', g: '示例商品 C ×1', time: '2026-03-15', st: '已完成', status: 'received', totalYuan: '59.00', phone: '137****9012', addr: '杭州市西湖区' }
]

const FALLBACK_PRODUCTS = [
  { id: 'p1', title: '示例商品 A', priceYuan: '99.00', tag: '热卖', cover: '/static/mall/products/product-a.png', stock: 100, sales: 528, status: 'on_sale' },
  { id: 'p2', title: '示例商品 B', priceYuan: '128.00', tag: '', cover: '/static/mall/products/product-b.png', stock: 50, sales: 312, status: 'on_sale' },
  { id: 'p3', title: '示例商品 C', priceYuan: '59.00', tag: '新品', cover: '/static/mall/products/product-c.png', stock: 20, sales: 89, status: 'on_sale' },
  { id: 'p4', title: '示例商品 D', priceYuan: '199.00', tag: '', cover: '/static/mall/products/product-d.png', stock: 0, sales: 201, status: 'off' }
]

const DEFAULT_SHOP_SETTINGS = {
  autoReply: true, pickupEnabled: true, smsEnabled: false,
  shopName: '我的小店', shopLogo: '', rating: '4.8'
}

const ROLE_LABELS = { owner: '店主', operator: '运营', service: '客服' }

// ============ 云对象主体 ============

module.exports = {
  // _before 留空，不依赖 uni-id-common
  async _before() {},

  // ============ 认证 ============

  async login(params = {}) {
    params = mergeCloudParams(this, params)
    const username = params.username != null ? String(params.username).trim() : ''
    const password = params.password != null ? String(params.password) : ''
    if (!username || !password) {
      return { errCode: 400, errMsg: '请输入账号和密码' }
    }
    try {
      const res = await db.collection('admin-user').where({ username }).limit(1).get()
      if (!res.data || res.data.length === 0) {
        return { errCode: 400, errMsg: '账号或密码错误' }
      }
      const admin = res.data[0]
      // eslint-disable-next-line eqeqeq
      if (admin.status != 1) {
        return { errCode: 403, errMsg: '账号已被禁用' }
      }
      const hashed = encryptPwd(password)
      if (hashed !== admin.password) {
        return { errCode: 400, errMsg: '账号或密码错误' }
      }
      // 自建 Token，不依赖 uni-id-common
      const token = createToken(admin._id)
      return {
        errCode: 0,
        token,
        uid: admin._id,
        role: admin.role || 'operator',
        roleLabel: ROLE_LABELS[admin.role] || '运营',
        nickname: admin.nickname || admin.username
      }
    } catch (e) {
      console.error('[admin-co] login exception:', e)
      return { errCode: 500, errMsg: '服务器错误: ' + (e && e.message ? e.message : String(e)) }
    }
  },

  async register(params = {}) {
    params = mergeCloudParams(this, params)
    const username = params.username != null ? String(params.username).trim() : ''
    const password = params.password != null ? String(params.password) : ''
    const role = params.role != null ? String(params.role) : 'operator'
    const nickname = params.nickname != null ? String(params.nickname) : username
    if (!username || !password) return { errCode: 400, errMsg: '请输入账号和密码' }
    if (password.length < 6) return { errCode: 400, errMsg: '密码至少6位' }
    try {
      const exists = await db.collection('admin-user').where({ username }).limit(1).get()
      if (exists.data && exists.data.length > 0) {
        return { errCode: 60001, errMsg: '该账号已存在' }
      }
      const now = Date.now()
      const addRes = await db.collection('admin-user').add({
        username, password: encryptPwd(password), role, nickname, status: 1, created_at: now
      })
      return { errCode: 0, id: addRes.id }
    } catch (e) {
      console.error('[admin-co] register exception:', e)
      return { errCode: 500, errMsg: '服务器错误: ' + (e && e.message ? e.message : String(e)) }
    }
  },

  async getAdminInfo(params = {}) {
    params = mergeCloudParams(this, params)
    const r = await adminVerifyToken(params.token)
    if (r.err) return r.err
    try {
      const res = await db.collection('admin-user').doc(r.uid).get()
      if (!res.data || res.data.length === 0) return { errCode: 404, errMsg: '管理员不存在' }
      const admin = res.data[0]
      return {
        errCode: 0,
        admin: {
          uid: admin._id, username: admin.username,
          nickname: admin.nickname || admin.username,
          role: admin.role || 'operator',
          roleLabel: ROLE_LABELS[admin.role] || '运营'
        }
      }
    } catch (e) {
      return { errCode: 500, errMsg: String(e && e.message ? e.message : e) }
    }
  },

  // ============ 商品管理 ============

  async getProductList(opts) {
    const params = mergeCloudParams(this, opts || {})
    const r = await adminVerifyToken(params.token)
    if (r.err) return r.err
    const limit = params.limit != null ? Math.min(Number(params.limit), 100) : 20
    const kw = params.kw != null ? String(params.kw).trim().toLowerCase() : ''
    const status = params.status != null ? String(params.status) : ''
    try {
      const col = db.collection('mall-product')
      const where = {}
      if (kw) where.title = new RegExp(kw, 'i')
      if (status) where.status = status
      let res
      try {
        res = await col.where(where).orderBy('created_at', 'desc').limit(limit).get()
      } catch (e1) {
        res = await col.where(where).limit(limit).get()
      }
      let list = (res && res.data) ? res.data.map(mapProductDoc) : []
      if (kw) list = list.filter((p) => (p.title || '').toLowerCase().indexOf(kw) >= 0)
      if (list.length > 0) return { errCode: 0, list, source: 'db' }
    } catch (e) {
      console.error('[admin-co] getProductList', e)
    }
    let fb = FALLBACK_PRODUCTS.filter((p) => !kw || (p.title || '').toLowerCase().indexOf(kw) >= 0)
    if (status) fb = fb.filter((p) => p.status === status)
    return { errCode: 0, list: fb.slice(0, limit), source: 'fallback' }
  },

  async getProductById(params) {
    params = mergeCloudParams(this, params || {})
    const r = await adminVerifyToken(params.token)
    if (r.err) return r.err
    const id = params.id != null ? String(params.id) : ''
    if (!id) return { errCode: 400, errMsg: 'missing id' }
    try {
      const res = await db.collection('mall-product').doc(id).get()
      const list = (res && res.data) ? res.data : []
      if (list.length === 0) {
        const fb = FALLBACK_PRODUCTS.find((p) => p.id === id)
        if (fb) return { errCode: 0, product: fb }
        return { errCode: 404, errMsg: 'not found' }
      }
      const doc = list[0]
      return {
        errCode: 0,
        product: {
          id: doc._id, title: doc.title || '', subtitle: doc.subtitle || '',
          priceYuan: centToYuan(doc.price_cent),
          marketPriceYuan: centToYuan(doc.market_price_cent),
          stock: doc.stock != null ? doc.stock : 0,
          cover: doc.cover || sampleProductCover(doc), images: doc.images || [],
          detail_html: doc.detail_html || '', tag: doc.tag || '',
          status: doc.status || 'off', sales: doc.sales != null ? doc.sales : 0
        }
      }
    } catch (e) {
      console.error('[admin-co] getProductById', e)
      const fb = FALLBACK_PRODUCTS.find((p) => p.id === params.id)
      if (fb) return { errCode: 0, product: fb }
      return { errCode: 500, errMsg: String(e && e.message ? e.message : e) }
    }
  },

  async createProduct(params = {}) {
    params = mergeCloudParams(this, params)
    const r = await adminVerifyToken(params.token)
    if (r.err) return r.err
    const title = params.title != null ? String(params.title).trim() : ''
    const priceYuan = params.priceYuan != null ? String(params.priceYuan) : '0'
    const stock = params.stock != null ? parseInt(String(params.stock), 10) : 0
    if (!title) return { errCode: 400, errMsg: '请填写商品名称' }
    try {
      const now = Date.now()
      const addRes = await db.collection('mall-product').add({
        title, subtitle: params.subtitle || '',
        price_cent: yuanToCent(priceYuan),
        market_price_cent: yuanToCent(params.marketPriceYuan || '0'),
        cover: params.cover || '', images: Array.isArray(params.images) ? params.images : [],
        tag: params.tag || '', status: params.status || 'on_sale',
        stock, sales: 0, detail_html: params.detail_html || '',
        created_at: now, updated_at: now
      })
      return { errCode: 0, id: addRes.id }
    } catch (e) {
      console.error('[admin-co] createProduct', e)
      return { errCode: 500, errMsg: String(e && e.message ? e.message : e) }
    }
  },

  async updateProduct(params = {}) {
    params = mergeCloudParams(this, params)
    const r = await adminVerifyToken(params.token)
    if (r.err) return r.err
    const id = params.id != null ? String(params.id) : ''
    if (!id) return { errCode: 400, errMsg: 'missing id' }
    try {
      const now = Date.now()
      const upd = { updated_at: now }
      if (params.title !== undefined) upd.title = String(params.title).trim()
      if (params.subtitle !== undefined) upd.subtitle = String(params.subtitle)
      if (params.priceYuan !== undefined) upd.price_cent = yuanToCent(params.priceYuan)
      if (params.marketPriceYuan !== undefined) upd.market_price_cent = yuanToCent(params.marketPriceYuan)
      if (params.stock !== undefined) upd.stock = parseInt(String(params.stock), 10)
      if (params.cover !== undefined) upd.cover = String(params.cover)
      if (params.tag !== undefined) upd.tag = String(params.tag)
      if (params.status !== undefined) upd.status = String(params.status)
      if (params.detail_html !== undefined) upd.detail_html = String(params.detail_html)
      await db.collection('mall-product').doc(id).update(upd)
      return { errCode: 0 }
    } catch (e) {
      console.error('[admin-co] updateProduct', e)
      return { errCode: 500, errMsg: String(e && e.message ? e.message : e) }
    }
  },

  async deleteProduct(params = {}) {
    params = mergeCloudParams(this, params)
    const r = await adminVerifyToken(params.token)
    if (r.err) return r.err
    const id = params.id != null ? String(params.id) : ''
    if (!id) return { errCode: 400, errMsg: 'missing id' }
    try {
      await db.collection('mall-product').doc(id).update({ status: 'off', updated_at: Date.now() })
      return { errCode: 0 }
    } catch (e) {
      console.error('[admin-co] deleteProduct', e)
      return { errCode: 500, errMsg: String(e && e.message ? e.message : e) }
    }
  },

  // ============ 订单管理 ============

  async getOrderList(opts) {
    const params = mergeCloudParams(this, opts || {})
    const r = await adminVerifyToken(params.token)
    if (r.err) return r.err
    const limit = params.limit != null ? Math.min(Number(params.limit), 50) : 20
    const status = params.status != null ? String(params.status) : ''
    try {
      const col = db.collection('mall-order')
      const where = {}
      if (status) where.status = status
      let res
      try {
        res = await col.where(where).orderBy('created_at', 'desc').limit(limit).get()
      } catch (e1) {
        res = await col.where(where).limit(limit).get()
      }
      const list = (res && res.data) ? res.data.map((o) => {
        const first = (o.items && o.items.length > 0) ? o.items[0] : null
        const snap = o.address_snapshot || {}
        return {
          id: o._id, order_no: o.order_no || '', status: o.status || '',
          statusText: orderStatusText(o.status),
          goodsTitle: first ? first.title : '',
          priceYuan: first ? centToYuan(first.price_cent) : '0.00',
          count: first ? first.qty : 1,
          totalYuan: centToYuan(o.total_cent || 0),
          time: formatOrderTime(o.created_at),
          phone: snap.phone || '',
          addrLine: (Array.isArray(snap.region) ? snap.region.join(' ') : String(snap.region || '')) + ' ' + (snap.detail || '')
        }
      }) : []
      return { errCode: 0, list, source: 'db' }
    } catch (e) {
      console.error('[admin-co] getOrderList', e)
    }
    let list = MOCK_ORDER_LIST.map((o) => ({
      id: o.id, order_no: o.order_no, status: o.status,
      statusText: orderStatusText(o.status),
      goodsTitle: o.g, priceYuan: o.totalYuan, count: 1,
      totalYuan: o.totalYuan, time: o.time, phone: o.phone, addrLine: o.addr
    }))
    if (status) list = list.filter((o) => o.status === status)
    return { errCode: 0, list: list.slice(0, limit), source: 'fallback' }
  },

  async getOrderByNo(params) {
    params = mergeCloudParams(this, params)
    const r = await adminVerifyToken(params.token)
    if (r.err) return r.err
    const order_no = params.order_no != null ? String(params.order_no) : ''
    if (!order_no) return { errCode: 400, errMsg: 'missing order_no' }
    try {
      const res = await db.collection('mall-order').where({ order_no }).limit(1).get()
      if (!res.data || res.data.length === 0) {
        const fb = MOCK_ORDER_LIST.find((o) => o.order_no === order_no)
        if (fb) {
          return {
            errCode: 0,
            order: {
              order_no: fb.order_no, status: fb.status,
              statusText: orderStatusText(fb.status),
              totalYuan: fb.totalYuan, time: fb.time,
              phone: fb.phone, addrLine: fb.addr,
              contactName: '', goodsTitle: fb.g,
              items: [{ title: fb.g, price_cent: 9900, qty: 1, cover: '' }],
              logistics: null
            },
            source: 'fallback'
          }
        }
        return { errCode: 404, errMsg: 'not found' }
      }
      const o = res.data[0]
      const snap = o.address_snapshot || {}
      return {
        errCode: 0,
        order: {
          order_no: o.order_no || '', status: o.status || '',
          statusText: orderStatusText(o.status),
          totalYuan: centToYuan(o.total_cent || 0),
          freightYuan: centToYuan(o.freight_cent || 0),
          time: formatOrderTime(o.created_at),
          phone: snap.phone || '',
          addrLine: (Array.isArray(snap.region) ? snap.region.join(' ') : String(snap.region || '')) + ' ' + (snap.detail || ''),
          contactName: snap.contact_name || '',
          items: o.items || [],
          logistics: o.logistics || null
        },
        source: 'db'
      }
    } catch (e) {
      console.error('[admin-co] getOrderByNo', e)
      return { errCode: 500, errMsg: String(e && e.message ? e.message : e) }
    }
  },

  async shipOrder(params = {}) {
    params = mergeCloudParams(this, params)
    const r = await adminVerifyToken(params.token)
    if (r.err) return r.err
    const order_no = params.order_no != null ? String(params.order_no) : ''
    if (!order_no) return { errCode: 400, errMsg: 'missing order_no' }
    try {
      const res = await db.collection('mall-order').where({ order_no }).limit(1).get()
      if (!res.data || res.data.length === 0) return { errCode: 404, errMsg: '订单不存在' }
      const doc = res.data[0]
      if (doc.status !== 'paid') return { errCode: 400, errMsg: '只有待发货状态可发货' }
      await db.collection('mall-order').doc(doc._id).update({
        status: 'shipped',
        logistics: { company: params.logistics_company || '', tracking_no: params.tracking_no || '' },
        updated_at: Date.now()
      })
      return { errCode: 0 }
    } catch (e) {
      console.error('[admin-co] shipOrder', e)
      return { errCode: 500, errMsg: String(e && e.message ? e.message : e) }
    }
  },

  async closeOrder(params = {}) {
    params = mergeCloudParams(this, params)
    const r = await adminVerifyToken(params.token)
    if (r.err) return r.err
    const order_no = params.order_no != null ? String(params.order_no) : ''
    if (!order_no) return { errCode: 400, errMsg: 'missing order_no' }
    try {
      const res = await db.collection('mall-order').where({ order_no }).limit(1).get()
      if (!res.data || res.data.length === 0) return { errCode: 404, errMsg: '订单不存在' }
      const doc = res.data[0]
      if (doc.status !== 'pending_pay' && doc.status !== 'paid') return { errCode: 400, errMsg: '当前状态不可关闭' }
      await db.collection('mall-order').doc(doc._id).update({
        status: 'closed', closeReason: params.reason || '管理员关闭', updated_at: Date.now()
      })
      return { errCode: 0 }
    } catch (e) {
      console.error('[admin-co] closeOrder', e)
      return { errCode: 500, errMsg: String(e && e.message ? e.message : e) }
    }
  },

  // ============ 统计 ============

  async getOrderStats(params = {}) {
    params = mergeCloudParams(this, params)
    const r = await adminVerifyToken(params.token)
    if (r.err) return r.err
    try {
      const now = Date.now()
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const todayTs = todayStart.getTime()
      let allRes
      try {
        allRes = await db.collection('mall-order').where({}).get()
      } catch (e1) { allRes = { data: [] } }
      const orders = allRes.data || []
      let todayAmount = 0, todayCount = 0, pendingShip = 0
      for (const o of orders) {
        const ct = o.created_at instanceof Date ? o.created_at.getTime() : Number(o.created_at || 0)
        if (o.status === 'paid') pendingShip++
        if (ct >= todayTs) {
          todayCount++
          if (o.status === 'paid' || o.status === 'shipped' || o.status === 'received') {
            todayAmount += Number(o.total_cent || 0)
          }
        }
      }
      return {
        errCode: 0,
        stats: {
          order7d: orders.reduce((sum, o) => sum + Number(o.total_cent || 0), 0),
          order7dYuan: centToYuan(orders.reduce((sum, o) => sum + Number(o.total_cent || 0), 0)),
          todayAmount: centToYuan(todayAmount),
          todayCount,
          pendingShip: pendingShip || parseInt(MOCK_STATS.pendingShip),
          visitors7d: parseInt(MOCK_STATS.visitors7d)
        }
      }
    } catch (e) {
      console.error('[admin-co] getOrderStats', e)
      return {
        errCode: 0,
        stats: {
          order7dYuan: MOCK_STATS.order7d, todayAmount: '0.00', todayCount: 0,
          pendingShip: parseInt(MOCK_STATS.pendingShip), visitors7d: parseInt(MOCK_STATS.visitors7d)
        }
      }
    }
  },

  async getProductStats(params = {}) {
    params = mergeCloudParams(this, params)
    const r = await adminVerifyToken(params.token)
    if (r.err) return r.err
    try {
      let res
      try {
        res = await db.collection('mall-product').where({}).get()
      } catch (e1) { res = { data: [] } }
      const products = res.data || []
      let totalStock = 0, onSale = 0, offSale = 0
      for (const p of products) {
        totalStock += Number(p.stock || 0)
        if (p.status === 'on_sale') onSale++; else offSale++
      }
      return {
        errCode: 0,
        stats: {
          total: products.length || 4,
          onSale: onSale || 3, offSale: offSale || 1, totalStock: totalStock || 170
        }
      }
    } catch (e) {
      console.error('[admin-co] getProductStats', e)
      return { errCode: 0, stats: { total: 4, onSale: 3, offSale: 1, totalStock: 170 } }
    }
  },

  async getUserStats(params = {}) {
    params = mergeCloudParams(this, params)
    const r = await adminVerifyToken(params.token)
    if (r.err) return r.err
    try {
      let res
      try {
        res = await db.collection('uni-id-users').where({}).get()
      } catch (e1) { res = { data: [] } }
      return { errCode: 0, stats: { total: res.data ? res.data.length : 18 } }
    } catch (e) {
      console.error('[admin-co] getUserStats', e)
      return { errCode: 0, stats: { total: 18 } }
    }
  },

  // ============ 店铺设置 ============

  async getShopSettings(params = {}) {
    params = mergeCloudParams(this, params)
    const r = await adminVerifyToken(params.token)
    if (r.err) return r.err
    try {
      const res = await db.collection('shop-settings').doc('shop').get()
      if (!res.data || res.data.length === 0) return { errCode: 0, settings: DEFAULT_SHOP_SETTINGS }
      return { errCode: 0, settings: res.data[0] }
    } catch (e) {
      console.error('[admin-co] getShopSettings', e)
      return { errCode: 0, settings: DEFAULT_SHOP_SETTINGS }
    }
  },

  async updateShopSettings(params = {}) {
    params = mergeCloudParams(this, params)
    const r = await adminVerifyToken(params.token)
    if (r.err) return r.err
    try {
      const upd = {}
      if (params.autoReply !== undefined) upd.autoReply = !!params.autoReply
      if (params.pickupEnabled !== undefined) upd.pickupEnabled = !!params.pickupEnabled
      if (params.smsEnabled !== undefined) upd.smsEnabled = !!params.smsEnabled
      if (params.shopName !== undefined) upd.shopName = String(params.shopName)
      if (params.shopLogo !== undefined) upd.shopLogo = String(params.shopLogo)
      if (params.rating !== undefined) upd.rating = String(params.rating)
      await db.collection('shop-settings').doc('shop').set({ ...upd, _id: 'shop' })
      return { errCode: 0 }
    } catch (e) {
      console.error('[admin-co] updateShopSettings', e)
      return { errCode: 500, errMsg: String(e && e.message ? e.message : e) }
    }
  },

  /**
   * 商家获取售后列表（支持状态筛选）
   * params: { token, status(''全部|open|processing|approved|rejected|closed), limit, offset }
   */
  async getAfterSalesList(params = {}) {
    params = mergeCloudParams(this, params)
    const r = await adminVerifyToken(params.token)
    if (r.err) return r.err
    const limit = Math.min(Number(params.limit) || 20, 50)
    const offset = Number(params.offset) || 0
    const status = params.status
    try {
      const col = db.collection('mall-ticket')
      let query = col.where({})
      if (status && status.length > 0) {
        query = col.where({ status })
      }
      const res = await query.orderBy('created_at', 'desc').skip(offset).limit(limit).get()
      const list = (res.data || []).map(doc => {
        const typeMap = { refund: '仅退款', return: '退货退款' }
        const statusMap = {
          open: '待处理',
          processing: '处理中',
          approved: '已通过',
          rejected: '已拒绝',
          closed: '已关闭'
        }
        return {
          _id: doc._id || '',
          orderId: doc.order_id || '',
          type: doc.type === 'return' ? 1 : 0,
          typeText: typeMap[doc.type] || '仅退款',
          reason: doc.reason || '',
          amount: doc.amount || '0',
          desc: doc.desc || '',
          images: doc.images || [],
          status: doc.status || 'open',
          statusText: statusMap[doc.status] || '待处理',
          createdAt: formatTs(doc.created_at),
          updatedAt: formatTs(doc.updated_at),
          reply: Array.isArray(doc.replies) && doc.replies.length > 0 ? doc.replies[doc.replies.length - 1].content : ''
        }
      })
      return { errCode: 0, list }
    } catch (e) {
      console.error('[admin-co] getAfterSalesList', e)
      return { errCode: 500, errMsg: String(e && e.message ? e.message : e) }
    }
  },

  /**
   * 商家处理售后申请（通过/拒绝/关闭）
   * params: { token, ticket_id, action('approve'|'reject'|'close'), reply }
   */
  async handleAfterSales(params = {}) {
    params = mergeCloudParams(this, params)
    const r = await adminVerifyToken(params.token)
    if (r.err) return r.err
    const ticket_id = params.ticket_id
    const action = params.action
    const reply = params.reply || ''
    if (!ticket_id || !action) {
      return { errCode: 400, errMsg: 'missing ticket_id or action' }
    }
    const statusMap = {
      approve: 'approved',
      reject: 'rejected',
      close: 'closed'
    }
    const newStatus = statusMap[action]
    if (!newStatus) {
      return { errCode: 400, errMsg: 'invalid action' }
    }
    try {
      const docRef = db.collection('mall-ticket').doc(ticket_id)
      const doc = await docRef.get()
      if (!doc.data || doc.data.length === 0) {
        return { errCode: 404, errMsg: '售后单不存在' }
      }
      const now = Date.now()
      const updateData = {
        status: newStatus,
        updated_at: now
      }
      if (reply.length > 0) {
        updateData.replies = doc.data[0].replies ? [...doc.data[0].replies, { content: reply, time: now, from: 'admin' }] : [{ content: reply, time: now, from: 'admin' }]
      }
      await docRef.update(updateData)
      return { errCode: 0 }
    } catch (e) {
      console.error('[admin-co] handleAfterSales', e)
      return { errCode: 500, errMsg: String(e && e.message ? e.message : e) }
    }
  }
}

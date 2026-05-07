// 商城云对象：读 mall-product；uni-id（手机号+密码）登录；mall-address / mall-order 读写。
'use strict'

const db = uniCloud.database()
const crypto = require('crypto')
const uniIdCommon = require('uni-id-common')
const createConfigCenter = require('uni-config-center')
const _ = db.command

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

function encryptPwd(password) {
  const secret = getPasswordSecret()
  return crypto.createHmac('sha1', String(secret)).update(String(password)).digest('hex')
}

/**
 * 合并客户端参数：部分端（如 H5 调云对象）方法首参可能为空，真实字段在 getParams()[0]
 */
function mergeCloudParams(ctx, params) {
  let p = params
  if (p == null || typeof p !== 'object') {
    p = {}
  }
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
  } catch (e) {
    /* ignore */
  }
  return p
}

async function requireUidFromToken(ctx, token) {
  if (!token) {
    return { err: { errCode: 401, errMsg: '请先登录' } }
  }
  try {
    const payload = await ctx.uniIdCommon.checkToken(token, { autoRefresh: false })
    const uid = payload.uid
    if (!uid) {
      return { err: { errCode: 401, errMsg: '登录已失效' } }
    }
    return { uid }
  } catch (e) {
    const msg = e && e.errMsg ? e.errMsg : '登录已失效'
    return { err: { errCode: 401, errMsg: msg } }
  }
}

function centToYuan(cent) {
  if (cent == null || isNaN(Number(cent))) {
    return '0.00'
  }
  return (Number(cent) / 100).toFixed(2)
}

function mapProductDoc(doc) {
  let tag = doc.tag || ''
  if (!tag && doc.sales != null && doc.sales > 500) {
    tag = '热卖'
  }
  if (!tag && doc.stock != null && doc.stock > 0 && doc.stock < 30) {
    tag = '新品'
  }
  const cover = doc.cover || sampleProductCover(doc)
  return {
    id: doc._id,
    title: doc.title || '',
    priceYuan: centToYuan(doc.price_cent),
    tag: tag,
    cover: cover
  }
}

function mapProductDetail(doc) {
  const row = mapProductDoc(doc)
  return {
    id: row.id,
    title: row.title,
    priceYuan: row.priceYuan,
    tag: row.tag,
    sub: doc.subtitle || '',
    cover: row.cover,
    stock: doc.stock != null ? doc.stock : 0,
    detail_html: doc.detail_html || ''
  }
}

function flashPriceCent(productId) {
  if (productId === 'p1') return 7900
  if (productId === 'p3') return 4900
  if (productId === 'p4') return 16800
  return 0
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

function orderStatusText(status) {
  const m = {
    pending_pay: '待付款',
    paid: '待发货',
    shipped: '待收货',
    received: '已完成',
    closed: '已关闭',
    refunding: '售后'
  }
  return m[status] || String(status || '')
}

function formatOrderTime(ts) {
  if (ts == null) {
    return ''
  }
  const d = new Date(typeof ts === 'number' ? ts : Number(ts))
  if (isNaN(d.getTime())) {
    return ''
  }
  // getHours() returns UTC; add 8 hours to convert to Beijing time (UTC+8)
  const utcMs = d.getTime()
  const beijingMs = utcMs + 8 * 60 * 60 * 1000
  const bj = new Date(beijingMs)
  const pad = (n) => (n < 10 ? '0' + n : '' + n)
  return bj.getFullYear() + '-' + pad(bj.getMonth() + 1) + '-' + pad(bj.getDate()) + ' ' + pad(bj.getHours()) + ':' + pad(bj.getMinutes())
}

function mapTicketStatus(s) {
  if (s === 'open') return 'progress'
  if (s === 'processing') return 'progress'
  if (s === 'approved') return 'success'
  if (s === 'rejected') return 'rejected'
  if (s === 'closed') return 'closed'
  return 'progress'
}

function mapTicketStatusText(s) {
  if (s === 'open') return '待处理'
  if (s === 'processing') return '处理中'
  if (s === 'approved') return '已通过'
  if (s === 'rejected') return '已拒绝'
  if (s === 'closed') return '已关闭'
  return s || ''
}

function buildTicketSteps(doc) {
  const steps = []
  const createdAt = formatTicketTime(doc.created_at)
  steps.push({ title: '提交售后申请', time: createdAt, desc: '等待商家处理' })
  if (doc.status === 'open') {
    steps.push({ title: '待商家处理', time: '', desc: '商家将在 24 小时内处理' })
  } else if (doc.status === 'processing') {
    steps.push({ title: '商家处理中', time: createdAt, desc: '商家正在处理中' })
    steps.push({ title: '待买家退货', time: '', desc: '请按退货地址寄回商品' })
  } else if (doc.status === 'approved') {
    steps.push({ title: '商家已通过', time: createdAt, desc: '' })
    steps.push({ title: '退款完成', time: createdAt, desc: '退款已原路返回' })
  } else if (doc.status === 'rejected') {
    steps.push({ title: '商家已拒绝', time: createdAt, desc: doc.reply || '如有异议请联系平台客服' })
  } else if (doc.status === 'closed') {
    steps.push({ title: '售后已关闭', time: createdAt, desc: '' })
  }
  return steps
}

function formatTicketTime(ts) {
  if (ts == null) return ''
  const d = new Date(typeof ts === 'number' ? ts : Number(ts))
  if (isNaN(d.getTime())) return ''
  const utcMs = d.getTime()
  const beijingMs = utcMs + 8 * 60 * 60 * 1000
  const bj = new Date(beijingMs)
  const pad = (n) => (n < 10 ? '0' + n : '' + n)
  return bj.getFullYear() + '-' + pad(bj.getMonth() + 1) + '-' + pad(bj.getDate()) + ' ' + pad(bj.getHours()) + ':' + pad(bj.getMinutes())
}

const FALLBACK_HOME = {
  errCode: 0,
  errMsg: '',
  banners: [
    { id: 'b1', title: '春季上新', subtitle: '满199减30' },
    { id: 'b2', title: '会员日', subtitle: '积分翻倍' }
  ],
  categories: [
    { id: 'c1', name: '数码', icon: 'phone' },
    { id: 'c2', name: '家居', icon: 'home' },
    { id: 'c3', name: '服饰', icon: 'shirt' },
    { id: 'c4', name: '食品', icon: 'coffee' }
  ],
  products: [
    { id: 'p1', title: '示例商品 A', priceYuan: '99.00', tag: '热卖', cover: '/static/mall/products/product-a.png' },
    { id: 'p2', title: '示例商品 B', priceYuan: '128.00', tag: '', cover: '/static/mall/products/product-b.png' },
    { id: 'p3', title: '示例商品 C', priceYuan: '59.00', tag: '新品', cover: '/static/mall/products/product-c.png' },
    { id: 'p4', title: '示例商品 D', priceYuan: '199.00', tag: '', cover: '/static/mall/products/product-d.png' }
  ],
  source: 'fallback'
}

module.exports = {
  async _before() {
    this.uniIdCommon = uniIdCommon.createInstance({
      clientInfo: this.getClientInfo()
    })
  },

  _timing: function (info) {},

  /**
   * 手机号 + 密码注册（演示：不走短信，与 uni-id-users 兼容）
   */
  async registerByMobilePassword(params = {}) {
    params = mergeCloudParams(this, params)
    const mobile = params.mobile != null ? String(params.mobile).trim() : ''
    const password = params.password != null ? String(params.password) : ''
    if (!/^1\d{10}$/.test(mobile)) {
      return { errCode: 400, errMsg: '请输入 11 位手机号' }
    }
    if (password.length < 6) {
      return { errCode: 400, errMsg: '密码至少 6 位' }
    }
    try {
      const exists = await db.collection('uni-id-users').where({ mobile }).limit(1).get()
      if (exists.data && exists.data.length > 0) {
        return { errCode: 60001, errMsg: '该手机号已注册' }
      }
      const client = this.getClientInfo()
      const now = Date.now()
      const addRes = await db.collection('uni-id-users').add({
        username: mobile,
        mobile,
        mobile_confirmed: 1,
        password: encryptPwd(password),
        nickname: '用户' + mobile.slice(-4),
        register_date: now,
        register_ip: (client && client.clientIP) ? client.clientIP : '',
        role: [],
        token: [],
        status: 0
      })
      const uid = addRes.id
      const tokenRes = await this.uniIdCommon.createToken({ uid })
      if (tokenRes.errCode !== 0) {
        return tokenRes
      }
      return {
        errCode: 0,
        token: tokenRes.token,
        tokenExpired: tokenRes.tokenExpired,
        uid,
        mobile
      }
    } catch (e) {
      console.error('[mall-co] registerByMobilePassword', e)
      return { errCode: 500, errMsg: String(e.message || e) }
    }
  },

  /**
   * 手机号 + 密码登录
   */
  async loginByMobilePassword(params = {}) {
    params = mergeCloudParams(this, params)
    const mobile = params.mobile != null ? String(params.mobile).trim() : ''
    const password = params.password != null ? String(params.password) : ''
    if (!/^1\d{10}$/.test(mobile) || !password) {
      return { errCode: 400, errMsg: '请输入手机号和密码' }
    }
    try {
      const res = await db.collection('uni-id-users').where({ mobile }).limit(1).get()
      if (!res.data || res.data.length === 0) {
        return { errCode: 400, errMsg: '账号或密码错误' }
      }
      const user = res.data[0]
      if (encryptPwd(password) !== user.password) {
        return { errCode: 400, errMsg: '账号或密码错误' }
      }
      const tokenRes = await this.uniIdCommon.createToken({ uid: user._id })
      if (tokenRes.errCode !== 0) {
        return tokenRes
      }
      return {
        errCode: 0,
        token: tokenRes.token,
        tokenExpired: tokenRes.tokenExpired,
        uid: user._id,
        mobile
      }
    } catch (e) {
      console.error('[mall-co] loginByMobilePassword', e)
      return { errCode: 500, errMsg: String(e.message || e) }
    }
  },

  async listAddresses(params = {}) {
    params = mergeCloudParams(this, params)
    const r = await requireUidFromToken(this, params.token)
    if (r.err) {
      return r.err
    }
    try {
      const res = await db.collection('mall-address').where({ user_id: r.uid }).get()
      const raw = res.data || []
      raw.sort((a, b) => (b.is_default === true ? 1 : 0) - (a.is_default === true ? 1 : 0))
      const list = raw.map((d) => ({
        id: d._id,
        name: d.contact_name || '',
        phone: d.phone || '',
        region: Array.isArray(d.region) ? d.region.join(' ') : String(d.region || ''),
        detail: d.detail || '',
        isDefault: !!d.is_default
      }))
      return { errCode: 0, list }
    } catch (e) {
      console.error('[mall-co] listAddresses', e)
      return { errCode: 500, errMsg: String(e.message || e) }
    }
  },

  async getAddress(params = {}) {
    params = mergeCloudParams(this, params)
    const r = await requireUidFromToken(this, params.token)
    if (r.err) {
      return r.err
    }
    const id = params.id != null ? String(params.id) : ''
    if (!id) {
      return { errCode: 400, errMsg: 'missing id' }
    }
    try {
      const res = await db.collection('mall-address').doc(id).get()
      if (!res.data || res.data.length === 0) {
        return { errCode: 404, errMsg: 'not found' }
      }
      const d = res.data[0]
      if (d.user_id !== r.uid) {
        return { errCode: 403, errMsg: '无权查看' }
      }
      return {
        errCode: 0,
        address: {
          id: d._id,
          name: d.contact_name || '',
          phone: d.phone || '',
          region: Array.isArray(d.region) ? d.region.join(' ') : String(d.region || ''),
          detail: d.detail || '',
          isDefault: !!d.is_default
        }
      }
    } catch (e) {
      console.error('[mall-co] getAddress', e)
      return { errCode: 500, errMsg: String(e.message || e) }
    }
  },

  async saveAddress(params = {}) {
    params = mergeCloudParams(this, params)
    const r = await requireUidFromToken(this, params.token)
    if (r.err) {
      return r.err
    }
    const contact_name = params.contact_name != null ? String(params.contact_name).trim() : ''
    const phone = params.phone != null ? String(params.phone).trim() : ''
    const detail = params.detail != null ? String(params.detail).trim() : ''
    let region = params.region
    if (typeof region === 'string') {
      region = region.trim() ? [region.trim()] : []
    }
    if (!Array.isArray(region)) {
      region = []
    }
    if (!contact_name) {
      return { errCode: 400, errMsg: '请填写收货人' }
    }
    if (!detail) {
      return { errCode: 400, errMsg: '请填写详细地址' }
    }
    let phoneNorm = phone.replace(/\D/g, '')
    if (phoneNorm.length === 12 && phoneNorm.endsWith('0')) {
      const head = phoneNorm.slice(0, 11)
      if (/^1\d{10}$/.test(head)) {
        phoneNorm = head
      }
    }
    if (!/^1\d{10}$/.test(phoneNorm)) {
      return { errCode: 400, errMsg: '手机号须为11位数字（以1开头），当前' + phoneNorm.length + '位' }
    }
    const phoneSave = phoneNorm
    const is_default = !!params.is_default
    const id = params.id != null ? String(params.id) : ''
    const now = Date.now()
    try {
      if (id) {
        const cur = await db.collection('mall-address').doc(id).get()
        if (!cur.data || cur.data.length === 0 || cur.data[0].user_id !== r.uid) {
          return { errCode: 403, errMsg: '无权操作' }
        }
        if (is_default) {
          await db.collection('mall-address').where({ user_id: r.uid }).update({ is_default: false })
        }
        await db.collection('mall-address').doc(id).update({
          contact_name,
          phone: phoneSave,
          region,
          detail,
          is_default,
          updated_at: now
        })
        return { errCode: 0, id }
      }
      const addRes = await db.collection('mall-address').add({
        user_id: r.uid,
        contact_name,
        phone: phoneSave,
        region,
        detail,
        is_default,
        created_at: now,
        updated_at: now
      })
      const newId = addRes.id
      if (is_default) {
        await db.collection('mall-address').where({ user_id: r.uid, _id: _.neq(newId) }).update({ is_default: false })
      }
      return { errCode: 0, id: newId }
    } catch (e) {
      console.error('[mall-co] saveAddress', e)
      return { errCode: 500, errMsg: String(e.message || e) }
    }
  },

  async removeAddress(params = {}) {
    params = mergeCloudParams(this, params)
    const r = await requireUidFromToken(this, params.token)
    if (r.err) {
      return r.err
    }
    const id = params.id != null ? String(params.id) : ''
    if (!id) {
      return { errCode: 400, errMsg: 'missing id' }
    }
    try {
      const cur = await db.collection('mall-address').doc(id).get()
      if (!cur.data || cur.data.length === 0 || cur.data[0].user_id !== r.uid) {
        return { errCode: 403, errMsg: '无权操作' }
      }
      await db.collection('mall-address').doc(id).remove()
      return { errCode: 0 }
    } catch (e) {
      console.error('[mall-co] removeAddress', e)
      return { errCode: 500, errMsg: String(e.message || e) }
    }
  },

  /**
   * 创建订单（默认价格以库内 mall-product 为准；演示秒杀活动使用固定活动价）
   * @param {{ token: string, address_id: string, lines: Array<{ product_id: string, qty: number, activity?: string }>, activity?: string, freight_cent?: number }} params
   */
  async createOrder(params = {}) {
    params = mergeCloudParams(this, params)
    const r = await requireUidFromToken(this, params.token)
    if (r.err) {
      return r.err
    }
    const address_id = params.address_id != null ? String(params.address_id) : ''
    const linesIn = Array.isArray(params.lines) ? params.lines : []
    if (!address_id || linesIn.length === 0) {
      return { errCode: 400, errMsg: '请选择地址并提交商品' }
    }
    try {
      const addrRes = await db.collection('mall-address').doc(address_id).get()
      if (!addrRes.data || addrRes.data.length === 0 || addrRes.data[0].user_id !== r.uid) {
        return { errCode: 400, errMsg: '收货地址无效' }
      }
      const ad = addrRes.data[0]
      const address_snapshot = {
        contact_name: ad.contact_name,
        phone: ad.phone,
        region: ad.region,
        detail: ad.detail
      }
      const pids = []
      for (let i = 0; i < linesIn.length; i++) {
        const pid = linesIn[i].product_id != null ? String(linesIn[i].product_id) : ''
        if (pid) {
          pids.push(pid)
        }
      }
      if (pids.length === 0) {
        return { errCode: 400, errMsg: '商品列表为空' }
      }
      const pres = await db.collection('mall-product').where({
        _id: _.in(pids),
        status: 'on_sale'
      }).get()
      const pmap = {}
      ;(pres.data || []).forEach((p) => {
        pmap[p._id] = p
      })
      const items = []
      let goodsCent = 0
      for (let i = 0; i < linesIn.length; i++) {
        const raw = linesIn[i]
        const product_id = raw.product_id != null ? String(raw.product_id) : ''
        let qty = parseInt(raw.qty, 10)
        if (isNaN(qty) || qty < 1) {
          qty = 1
        }
        const p = pmap[product_id]
        if (!p) {
          return { errCode: 400, errMsg: '商品不存在或已下架' }
        }
        if (p.stock != null && p.stock < qty) {
          return { errCode: 400, errMsg: '库存不足：' + (p.title || product_id) }
        }
        let pc = p.price_cent != null ? Number(p.price_cent) : 0
        const activity = raw.activity != null ? String(raw.activity) : (params.activity != null ? String(params.activity) : '')
        if (activity === 'flash') {
          const fp = flashPriceCent(product_id)
          if (fp > 0) {
            pc = fp
          }
        }
        items.push({
          product_id: p._id,
          sku_id: '',
          title: p.title || '',
          price_cent: pc,
          qty,
          cover: p.cover || ''
        })
        goodsCent += pc * qty
      }
      const freight_cent = params.freight_cent != null ? Number(params.freight_cent) : 800
      const total_cent = goodsCent + freight_cent
      const order_no = 'M' + Date.now() + Math.floor(1000 + Math.random() * 9000)
      const now = Date.now()
      await db.collection('mall-order').add({
        user_id: r.uid,
        order_no,
        status: 'pending_pay',
        address_snapshot,
        items,
        freight_cent,
        total_cent,
        created_at: now,
        updated_at: now
      })
      return {
        errCode: 0,
        order_no,
        total_cent,
        totalYuan: centToYuan(total_cent)
      }
    } catch (e) {
      console.error('[mall-co] createOrder', e)
      return { errCode: 500, errMsg: String(e.message || e) }
    }
  },

  async listMyOrders(params = {}) {
    params = mergeCloudParams(this, params)
    const r = await requireUidFromToken(this, params.token)
    if (r.err) {
      return r.err
    }
    try {
      let res
      try {
        res = await db.collection('mall-order').where({ user_id: r.uid }).orderBy('created_at', 'desc').limit(50).get()
      } catch (e1) {
        res = await db.collection('mall-order').where({ user_id: r.uid }).limit(50).get()
      }
      const list = (res.data || []).map((o) => {
        const items = o.items || []
        const first = items.length > 0 ? items[0] : null
        const count = first ? first.qty : 1
        const cov = first && first.cover ? String(first.cover) : ''
        return {
          id: o.order_no,
          status: o.status,
          statusText: orderStatusText(o.status),
          goodsTitle: first ? first.title : '',
          spec: '默认规格',
          priceYuan: first ? centToYuan(first.price_cent) : '0.00',
          count,
          time: formatOrderTime(o.created_at),
          productId: first ? first.product_id : '',
          cover: cov,
          payTotalYuan: centToYuan(o.total_cent != null ? o.total_cent : 0)
        }
      })
      return { errCode: 0, list }
    } catch (e) {
      console.error('[mall-co] listMyOrders', e)
      return { errCode: 500, errMsg: String(e.message || e) }
    }
  },

  async getMyOrder(params = {}) {
    params = mergeCloudParams(this, params)
    const r = await requireUidFromToken(this, params.token)
    if (r.err) {
      return r.err
    }
    const order_no = params.order_no != null ? String(params.order_no) : ''
    if (!order_no) {
      return { errCode: 400, errMsg: 'missing order_no' }
    }
    try {
      const res = await db.collection('mall-order').where({ user_id: r.uid, order_no }).limit(1).get()
      if (!res.data || res.data.length === 0) {
        return { errCode: 404, errMsg: 'not found' }
      }
      const o = res.data[0]
      const items = o.items || []
      const first = items.length > 0 ? items[0] : null
      const count = first ? first.qty : 1
      const snap = o.address_snapshot || {}
      const regionStr = Array.isArray(snap.region) ? snap.region.join(' ') : String(snap.region || '')
      const row = {
        id: o.order_no,
        status: o.status,
        statusText: orderStatusText(o.status),
        goodsTitle: first ? first.title : '',
        spec: '默认规格',
        priceYuan: first ? centToYuan(first.price_cent) : '0.00',
        count,
        time: formatOrderTime(o.created_at),
        productId: first ? first.product_id : '',
        cover: first && first.cover ? String(first.cover) : ''
      }
      const payTotal = centToYuan(o.total_cent != null ? o.total_cent : 0)
      const freightYuan = centToYuan(o.freight_cent != null ? o.freight_cent : 0)
      return {
        errCode: 0,
        row,
        addrName: (snap.contact_name || '') + ' ' + (snap.phone || ''),
        addrLine: regionStr + ' ' + (snap.detail || ''),
        payTotal,
        freightYuan,
        items,
        order: o
      }
    } catch (e) {
      console.error('[mall-co] getMyOrder', e)
      return { errCode: 500, errMsg: String(e.message || e) }
    }
  },

  /**
   * 取消（关闭）本人订单：仅待付款可取消，写入 status=closed
   */
  async cancelMyOrder(params = {}) {
    params = mergeCloudParams(this, params)
    const r = await requireUidFromToken(this, params.token)
    if (r.err) {
      return r.err
    }
    const order_no = params.order_no != null ? String(params.order_no) : ''
    if (!order_no) {
      return { errCode: 400, errMsg: 'missing order_no' }
    }
    try {
      const res = await db.collection('mall-order').where({ user_id: r.uid, order_no }).limit(1).get()
      if (!res.data || res.data.length === 0) {
        return { errCode: 404, errMsg: 'not found' }
      }
      const doc = res.data[0]
      if (doc.status !== 'pending_pay') {
        return { errCode: 400, errMsg: '只能取消待付款订单' }
      }
      await db.collection('mall-order').doc(doc._id).update({
        status: 'closed',
        updated_at: Date.now()
      })
      return { errCode: 0 }
    } catch (e) {
      console.error('[mall-co] cancelMyOrder', e)
      return { errCode: 500, errMsg: String(e.message || e) }
    }
  },

  /**
   * 确认收货：仅 status=shipped（待收货）可确认，写入 status=received
   */
  async confirmReceive(params = {}) {
    params = mergeCloudParams(this, params)
    const r = await requireUidFromToken(this, params.token)
    if (r.err) {
      return r.err
    }
    const order_no = params.order_no != null ? String(params.order_no) : ''
    if (!order_no) {
      return { errCode: 400, errMsg: 'missing order_no' }
    }
    try {
      const res = await db.collection('mall-order').where({ user_id: r.uid, order_no }).limit(1).get()
      if (!res.data || res.data.length === 0) {
        return { errCode: 404, errMsg: 'not found' }
      }
      const doc = res.data[0]
      if (doc.status !== 'shipped') {
        return { errCode: 400, errMsg: '只能确认待收货订单' }
      }
      await db.collection('mall-order').doc(doc._id).update({
        status: 'received',
        updated_at: Date.now()
      })
      return { errCode: 0 }
    } catch (e) {
      console.error('[mall-co] confirmReceive', e)
      return { errCode: 500, errMsg: String(e.message || e) }
    }
  },

  /**
   * 用户提交售后申请（仅退款 或 退货退款）
   * params: { token, order_id, type(0仅退款|1退货退款), reason, amount, desc, images }
   */
  async createAfterSales(params = {}) {
    params = mergeCloudParams(this, params)
    const r = await requireUidFromToken(this, params.token)
    if (r.err) {
      return r.err
    }
    const order_no = params.order_id != null ? String(params.order_id) : ''
    if (!order_no) {
      return { errCode: 400, errMsg: 'missing order_id' }
    }
    const type = params.type === 1 ? 'return' : 'refund'
    try {
      // 检查订单是否存在且属于当前用户
      const ordRes = await db.collection('mall-order').where({ user_id: r.uid, order_no }).limit(1).get()
      if (!ordRes.data || ordRes.data.length === 0) {
        return { errCode: 404, errMsg: '订单不存在' }
      }
      const doc = ordRes.data[0]
      // 仅 shipped/received/closed 状态可申请售后
      const ok = ['shipped', 'received', 'closed'].indexOf(doc.status) >= 0
      if (!ok) {
        return { errCode: 400, errMsg: '当前订单状态不支持申请售后' }
      }
      // 生成售后单号
      const now = new Date()
      const pad = (n) => n.toString().padStart(2, '0')
      const asNo = 'AS' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) +
        pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds())
      await db.collection('mall-ticket').add({
        user_id: r.uid,
        order_id: order_no,
        type,
        reason: params.reason || '',
        amount: params.amount || '0',
        desc: params.desc || '',
        images: Array.isArray(params.images) ? params.images : [],
        status: 'open',
        replies: [],
        created_at: Date.now(),
        updated_at: Date.now()
      })
      return { errCode: 0, afterSalesNo: asNo }
    } catch (e) {
      console.error('[mall-co] createAfterSales', e)
      return { errCode: 500, errMsg: String(e.message || e) }
    }
  },

  /**
   * 用户查询自己的售后记录列表
   * params: { token, limit, offset }
   */
  async getMyAfterSalesList(params = {}) {
    params = mergeCloudParams(this, params)
    const r = await requireUidFromToken(this, params.token)
    if (r.err) {
      return r.err
    }
    const limit = Math.min(Number(params.limit) || 20, 50)
    const offset = Number(params.offset) || 0
    try {
      const col = db.collection('mall-ticket')
      const res = await col.where({ user_id: r.uid })
        .orderBy('created_at', 'desc')
        .skip(offset)
        .limit(limit)
        .get()
      const list = (res.data || []).map(doc => ({
        id: doc.order_id || '',
        statusKey: mapTicketStatus(doc.status),
        statusText: mapTicketStatusText(doc.status),
        type: doc.type === 'return' ? 1 : 0,
        reason: doc.reason || '',
        amount: doc.amount || '0',
        time: formatTicketTime(doc.created_at),
        goodsTitle: '',
        spec: '',
        cover: '',
        images: doc.images || [],
        desc: doc.desc || '',
        steps: buildTicketSteps(doc)
      }))
      return { errCode: 0, list }
    } catch (e) {
      console.error('[mall-co] getMyAfterSalesList', e)
      return { errCode: 500, errMsg: String(e.message || e) }
    }
  },

  /**
   * 物理删除本人已关闭订单（仅 status=closed，其他状态不可删）
   */
  async deleteClosedMyOrder(params = {}) {
    params = mergeCloudParams(this, params)
    const r = await requireUidFromToken(this, params.token)
    if (r.err) {
      return r.err
    }
    const order_no = params.order_no != null ? String(params.order_no) : ''
    if (!order_no) {
      return { errCode: 400, errMsg: 'missing order_no' }
    }
    try {
      const res = await db.collection('mall-order').where({ user_id: r.uid, order_no }).limit(1).get()
      if (!res.data || res.data.length === 0) {
        return { errCode: 404, errMsg: 'not found' }
      }
      const doc = res.data[0]
      if (doc.status !== 'closed' && doc.status !== 'received') {
        return { errCode: 400, errMsg: '只能删除已关闭或已完成的订单' }
      }
      await db.collection('mall-order').doc(doc._id).remove()
      return { errCode: 0 }
    } catch (e) {
      console.error('[mall-co] deleteClosedMyOrder', e)
      return { errCode: 500, errMsg: String(e.message || e) }
    }
  },

  /**
   * 演示收银台：将待付款标为已支付（无真实支付，pay_channel=demo，仅用于前后端联调/演示闭环）
   */
  async markOrderPaidDemo(params = {}) {
    params = mergeCloudParams(this, params)
    const r = await requireUidFromToken(this, params.token)
    if (r.err) {
      return r.err
    }
    const order_no = params.order_no != null ? String(params.order_no) : ''
    if (!order_no) {
      return { errCode: 400, errMsg: 'missing order_no' }
    }
    try {
      const res = await db.collection('mall-order').where({ user_id: r.uid, order_no }).limit(1).get()
      if (!res.data || res.data.length === 0) {
        return { errCode: 404, errMsg: 'not found' }
      }
      const doc = res.data[0]
      if (doc.status !== 'pending_pay') {
        return { errCode: 400, errMsg: '仅待付款订单可演示支付' }
      }
      await db.collection('mall-order').doc(doc._id).update({
        status: 'paid',
        pay_channel: 'demo',
        updated_at: Date.now()
      })
      return { errCode: 0 }
    } catch (e) {
      console.error('[mall-co] markOrderPaidDemo', e)
      return { errCode: 500, errMsg: String(e.message || e) }
    }
  },

  async getHomeBlocks() {
    const out = {
      errCode: 0,
      errMsg: '',
      banners: FALLBACK_HOME.banners,
      categories: FALLBACK_HOME.categories,
      products: [],
      source: 'db'
    }
    try {
      const col = db.collection('mall-product')
      let res
      try {
        res = await col.where({ status: 'on_sale' }).orderBy('created_at', 'desc').limit(20).get()
      } catch (e1) {
        res = await col.where({ status: 'on_sale' }).limit(20).get()
      }
      const list = (res && res.data) ? res.data : []
      if (list.length === 0) {
        out.products = FALLBACK_HOME.products
        out.source = 'fallback_empty_db'
        return out
      }
      out.products = list.map(mapProductDoc)
      return out
    } catch (e) {
      console.error('[mall-co] getHomeBlocks', e)
      out.products = FALLBACK_HOME.products
      out.source = 'fallback_error'
      return out
    }
  },

  async getProductById(params) {
    params = mergeCloudParams(this, params || {})
    const id = params != null ? params.id : ''
    if (!id) {
      return { errCode: 400, errMsg: 'missing id' }
    }
    try {
      const col = db.collection('mall-product')
      const res = await col.doc(id).get()
      const list = (res && res.data) ? res.data : []
      if (list.length === 0) {
        return { errCode: 404, errMsg: 'not found' }
      }
      const doc = list[0]
      if (doc.status && doc.status !== 'on_sale') {
        return { errCode: 404, errMsg: 'off shelf' }
      }
      return { errCode: 0, product: mapProductDetail(doc) }
    } catch (e) {
      console.error('[mall-co] getProductById', e)
      return { errCode: 500, errMsg: String(e.message || e) }
    }
  },

  async getProductList(opts) {
    const params = mergeCloudParams(this, opts || {})
    const limit = params != null && params.limit != null ? Math.min(Number(params.limit), 100) : 20
    const kw = params.kw != null ? String(params.kw).trim().toLowerCase() : ''
    try {
      const col = db.collection('mall-product')
      let res
      try {
        res = await col.where({ status: 'on_sale' }).orderBy('created_at', 'desc').limit(100).get()
      } catch (e1) {
        res = await col.where({ status: 'on_sale' }).limit(100).get()
      }
      let list = (res && res.data) ? res.data.map(mapProductDoc) : []
      if (kw) {
        list = list.filter((p) => (p.title || '').toLowerCase().indexOf(kw) >= 0)
      }
      if (list.length > limit) {
        list = list.slice(0, limit)
      }
      if (list.length > 0) {
        return { errCode: 0, list }
      }
    } catch (e) {
      console.error('[mall-co] getProductList', e)
    }
    const fb = FALLBACK_HOME.products.filter((p) => !kw || (p.title || '').toLowerCase().indexOf(kw) >= 0).slice(0, limit)
    return { errCode: 0, list: fb, source: 'fallback' }
  }
}

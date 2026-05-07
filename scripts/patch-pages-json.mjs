import fs from 'fs'
import path from 'path'

const root = path.resolve('e:\\mechantuni\\mechant')
const pagesPath = path.join(root, 'pages.json')
let s = fs.readFileSync(pagesPath, 'utf8')

const mallPages = []
const add = (p, title) => mallPages.push({ path: p, style: { navigationBarTitleText: title } })

add('user/login', '登录')
add('user/register', '注册')
add('user/center', '我的')
add('user/profile', '个人信息')
add('user/address-list', '收货地址')
add('user/address-edit', '编辑地址')
add('user/security', '账户安全')
add('user/member', '会员中心')
add('shop/search', '搜索')
add('shop/search-result', '搜索结果')
add('shop/product-detail', '商品详情')
add('shop/favorites', '我的收藏')
add('shop/shop-brand', '店铺')
add('order/confirm', '确认订单')
add('order/pickup', '自提点')
add('order/order-list', '我的订单')
add('order/order-detail', '订单详情')
add('pay/checkout', '收银台')
add('pay/pay-result', '支付结果')
add('pay/coupon-pick', '选择优惠券')
add('pay/coupons', '优惠券')
add('pay/promo-rule', '活动规则')
add('pay/bill-list', '支付记录')
add('pay/bill-detail', '账单详情')
add('pay/refund-list', '退款记录')
add('pay/refund-detail', '退款详情')
add('logistics/track', '物流跟踪')
add('logistics/delivery-info', '配送说明')
add('mkt/flash', '限时秒杀')
add('mkt/flash-detail', '秒杀详情')
add('mkt/group-list', '拼团')
add('mkt/group-detail', '拼团详情')
add('mkt/bargain', '砍价')
add('mkt/coupon-center', '领券中心')
add('mkt/popup-demo', '弹窗演示')
add('content/notes', '种草笔记')
add('content/note-detail', '笔记详情')
add('content/video', '短视频')
add('content/reviews', '评价')
add('content/qa-list', '问大家')
add('content/qa-detail', '问答详情')
add('svc/chat', '客服')
add('svc/ticket-list', '工单')
add('svc/ticket-new', '新建工单')
add('svc/ticket-detail', '工单详情')
add('svc/help', '帮助中心')

const adminPages = []
const addA = (p, title) => adminPages.push({ path: p, style: { navigationBarTitleText: title } })
addA('dashboard', '经营看板')
addA('user-analytics', '用户分析')
addA('product-analytics', '商品分析')
addA('login', '商家登录')
addA('onboarding', '商家入驻')
addA('shop-settings', '店铺设置')
addA('products', '商品管理')
addA('product-edit', '编辑商品')
addA('orders', '订单管理')
addA('roles', '权限管理')

const mallBlock = `		{
			"root": "packages/mall",
			"pages": ${JSON.stringify(mallPages, null, '\t\t\t').replace(/\n/g, '\n\t\t\t').replace(/^\t\t\t/, '\t\t\t')}
		},
`
// fix stringify - too messy. Build manually compact
function fmtPages(arr) {
  return (
    '[\n' +
    arr
      .map(
        (x) =>
          `\t\t\t\t{\n\t\t\t\t\t"path": "${x.path}",\n\t\t\t\t\t"style": {\n\t\t\t\t\t\t"navigationBarTitleText": "${x.style.navigationBarTitleText}"\n\t\t\t\t\t}\n\t\t\t\t}`
      )
      .join(',\n') +
    '\n\t\t\t]'
  )
}

const blockMall = `\t\t{
\t\t\t"root": "packages/mall",
\t\t\t"pages": ${fmtPages(mallPages)}
\t\t},
`
const blockAdmin = `\t\t{
\t\t\t"root": "packages/admin",
\t\t\t"pages": ${fmtPages(adminPages)}
\t\t},
`

const insertMain = `\t\t{
\t\t\t"path": "pages/mall/home/home",
\t\t\t"style": {
\t\t\t\t"navigationBarTitleText": "首页"
\t\t\t}
\t\t},
\t\t{
\t\t\t"path": "pages/mall/category/category",
\t\t\t"style": {
\t\t\t\t"navigationBarTitleText": "分类"
\t\t\t}
\t\t},
\t\t{
\t\t\t"path": "pages/mall/cart/cart",
\t\t\t"style": {
\t\t\t\t"navigationBarTitleText": "购物车"
\t\t\t}
\t\t},
\t\t{
\t\t\t"path": "pages/mall/mine/mine",
\t\t\t"style": {
\t\t\t\t"navigationBarTitleText": "我的"
\t\t\t}
\t\t},
`

if (!s.includes('"path": "pages/mall/home/home"')) {
  s = s.replace(
    /(\{\s*"path":\s*"pages\/tabBar\/tab-bar"\s*\},)/,
    `$1\n${insertMain}`
  )
}

if (!s.includes('"root": "packages/mall"')) {
  s = s.replace('"subPackages": [\n', `"subPackages": [\n${blockMall}${blockAdmin}`)
}

const newTab = `"tabBar": {
		"color": "@tabBarColor",
		"selectedColor": "@tabBarSelectedColor",
		"borderStyle": "@tabBarBorderStyle",
		"backgroundColor": "@tabBarBackgroundColor",
		"list": [
			{
				"pagePath": "pages/mall/home/home",
				"iconPath": "static/mall/tab-home.png",
				"selectedIconPath": "static/mall/tab-home-on.png",
				"text": "首页"
			},
			{
				"pagePath": "pages/mall/category/category",
				"iconPath": "static/mall/tab-category.png",
				"selectedIconPath": "static/mall/tab-category-on.png",
				"text": "分类"
			},
			{
				"pagePath": "pages/mall/cart/cart",
				"iconPath": "static/mall/tab-cart.png",
				"selectedIconPath": "static/mall/tab-cart-on.png",
				"text": "购物车"
			},
			{
				"pagePath": "pages/mall/mine/mine",
				"iconPath": "static/mall/tab-mine.png",
				"selectedIconPath": "static/mall/tab-mine-on.png",
				"text": "我的"
			}
		]
	}`

s = s.replace(/"tabBar": \{[\s\S]*?\n\t\},/, newTab)

fs.writeFileSync(pagesPath, s, 'utf8')
console.log('patched pages.json')

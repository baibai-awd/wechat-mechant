'use strict'
/**
 * 商城业务订单支付成功：mall-order.order_no 与 uni-pay 的 order_no 一致，金额 total_fee（分）须与 total_cent 一致
 */
const db = uniCloud.database()

module.exports = async (obj) => {
  let user_order_success = false
  const { data = {} } = obj
  const order_no = data.order_no
  const total_fee = data.total_fee
  const provider = data.provider != null ? String(data.provider) : ''

  if (!order_no) {
    console.error('[mall notify goods] missing order_no')
    return false
  }

  try {
    const col = db.collection('mall-order')
    const res = await col.where({ order_no: String(order_no), status: 'pending_pay' }).limit(1).get()
    if (!res.data || res.data.length === 0) {
      console.error('[mall notify goods] mall-order not found or not pending_pay:', order_no)
      return false
    }
    const doc = res.data[0]
    const expectCent = doc.total_cent != null ? Number(doc.total_cent) : -1
    const payCent = total_fee != null ? Number(total_fee) : -1
    if (expectCent >= 0 && payCent >= 0 && expectCent !== payCent) {
      console.error('[mall notify goods] amount mismatch pay', payCent, 'expect', expectCent, order_no)
      return false
    }
    let pay_channel = provider
    if (provider.indexOf('wx') >= 0) {
      pay_channel = 'wxpay'
    } else if (provider.indexOf('ali') >= 0) {
      pay_channel = 'alipay'
    }
    await col.doc(doc._id).update({
      status: 'paid',
      pay_channel,
      updated_at: Date.now()
    })
    user_order_success = true
  } catch (e) {
    console.error('[mall notify goods]', e)
    user_order_success = false
  }
  return user_order_success
}

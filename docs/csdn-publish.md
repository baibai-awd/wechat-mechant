# uni-app x 商城 + 商家后台项目实战：从小程序到 H5 的完整业务 Demo

> 本文记录一个基于 uni-app x、Vue3、UTS、uniCloud 开发的商城项目。项目包含商城前台、登录注册、购物车、订单流程、商品详情、商家后台、商品管理、订单管理等模块，可作为 uni-app x 商城类项目的学习 Demo 或二次开发基础。

## 一、项目介绍

这个项目名称为 `mechant`，是一个商城业务 Demo。它不是单纯的组件展示，而是围绕真实电商业务做了一套完整页面和接口结构。

项目主要包含两部分：

- 商城前台：给用户浏览商品、加入购物车、下单、查看订单。
- 商家后台：给商家管理商品、订单、店铺配置和数据看板。

项目支持 H5 预览，也支持编译到微信小程序端运行。后端接口主要通过 uniCloud 云对象实现。

## 二、技术栈

| 类型 | 技术 |
| --- | --- |
| 跨端框架 | uni-app x |
| 前端框架 | Vue 3 |
| 页面文件 | `.uvue` |
| 开发语言 | UTS / JavaScript |
| 后端服务 | uniCloud 云对象 |
| 小程序端 | 微信小程序 mp-weixin |
| H5 端 | Web 预览 |
| 数据存储 | uniCloud 数据库 + 本地 fallback 数据 |

项目 `manifest.json` 中的核心配置如下：

```json
{
  "name": "mechant",
  "appid": "__UNI__XXXXXXX",
  "versionName": "2.0.2",
  "vueVersion": "3",
  "uni-app-x": {
    "vapor": true,
    "styleIsolationVersion": "2"
  }
}
```

## 三、项目功能

### 1. 商城首页

首页包含搜索入口、活动专区、推荐商品、营销入口等模块。

商品数据支持从云端 `mall-product` 表读取。如果云端商品没有配置封面图，前端会自动使用本地示例图兜底。

本地示例图路径：

```text
static/mall/products/product-a.png
static/mall/products/product-b.png
static/mall/products/product-c.png
static/mall/products/product-d.png
```

### 2. 商品分类

分类页采用左侧分类导航 + 右侧内容区结构，后续可以继续扩展二级分类、品牌筛选、分类推荐商品等功能。

### 3. 商品详情

商品详情页包含商品图片、价格、标签、标题、副标题、规格选择入口、图文详情、加入购物车和立即购买按钮。

如果商品存在 `cover` 字段，页面展示真实商品图；如果没有，则展示本地示例图。

### 4. 购物车

购物车支持本地存储、商品数量增减、合计金额计算、商品封面展示和跳转确认订单。

购物车数据结构如下：

```ts
export type MallCartLine = {
  id: string
  title: string
  priceYuan: string
  cover: string
  qty: number
}
```

### 5. 登录注册

用户端支持手机号 + 密码注册登录，接口通过 `mall-co` 云对象实现。注册失败时会展示真实错误信息，方便开发阶段排查问题。

### 6. 订单流程

订单相关页面包括：

- 确认订单
- 地址选择
- 运费展示
- 提交订单
- 订单列表
- 订单详情
- 售后入口

订单列表和订单详情中也支持商品封面展示，形成完整购物闭环。

### 7. 商家后台

后台页面包含：

- 商家登录/注册
- 商家工作台
- 商品管理
- 商品编辑
- 订单管理
- 店铺设置
- 售后管理
- 商品分析
- 用户分析
- 角色权限
- 开店引导

后台 UI 使用浅灰背景、白色卡片、绿色主色、状态标签和紧凑列表布局，更符合管理系统的使用场景。

## 四、目录结构

项目核心目录如下：

```text
pages/mall/                         商城主 tab 页面
packages/mall/                      商城分包页面
packages/admin/                     商家后台页面
utils/mall-catalog.uts              商品本地目录和示例图兜底
utils/mall-cart.uts                 本地购物车逻辑
static/mall/products/               本地商品示例图
uniCloud-aliyun/cloudfunctions/     uniCloud 云对象
```

核心云对象：

```text
uniCloud-aliyun/cloudfunctions/mall-co/index.obj.js
uniCloud-aliyun/cloudfunctions/admin-co/index.obj.js
```

`mall-co` 主要面向商城前台，负责商品、用户、订单、售后等接口。

`admin-co` 主要面向商家后台，负责后台登录、商品管理、订单管理、店铺配置、数据分析等接口。

## 五、运行方式

### 1. HBuilderX 导入项目

使用 HBuilderX 打开项目根目录。

推荐使用较新的 HBuilderX 和 uni-app x 编译器版本。

### 2. H5 预览

在 HBuilderX 中选择：

```text
运行 -> 运行到浏览器
```

本地预览地址类似：

```text
http://localhost:5173/web/#/
```

### 3. 微信小程序预览

在 HBuilderX 中选择：

```text
运行 -> 运行到小程序模拟器 -> 微信开发者工具
```

如果开发阶段遇到合法域名限制，可以先在微信开发者工具中关闭 URL 校验。正式上线前需要在微信公众平台配置合法域名。

## 六、开发中遇到的问题

### 1. app.json 找不到

微信开发者工具可能报错：

```text
app.json: 在项目根目录未找到 app.json
```

原因是 uni-app x 编译后的小程序产物不在项目根目录，而是在：

```text
unpackage/dist/dev/mp-weixin/
```

解决方式是在 `project.config.json` 中配置：

```json
{
  "miniprogramRoot": "unpackage/dist/dev/mp-weixin/"
}
```

### 2. request 合法域名报错

常见报错：

```text
https://api.next.bspapp.com 不在 request 合法域名列表中
```

解决方式：

- 开发阶段可以关闭微信开发者工具 URL 校验。
- 正式发布需要在微信公众平台配置合法域名。
- 如果在 uniCloud 管理后台更新过域名，需要刷新项目配置并重新编译。

操作路径：

```text
详情 -> 域名信息
```

### 3. WebSocket close 1006 报错

微信开发者工具中可能出现：

```text
closeSocket:fail Failed to execute 'close' on 'WebSocket':
The code must be either 1000, or between 3000 and 4999. 1006 is neither.
```

这个问题通常和开发工具或运行时兼容有关。开发阶段可以通过补丁脚本修复构建产物，长期建议升级 HBuilderX 或 uni 编译器。

### 4. H5 底部 tabBar 上方多出空白

H5 端使用原生 tabBar 时，uni-app 会通过下面这个伪元素自动预留底部空间：

```css
uni-page-body::after
```

在浏览器 DevTools 中可以看到它高度大约是 `50px`。

解决方式是在 H5 入口 `index.html` 中覆盖该伪元素：

```css
html body uni-app.uni-app--showtabbar uni-page-body::after,
html body uni-page-body::after {
  content: none !important;
  display: none !important;
  height: 0 !important;
  min-height: 0 !important;
}
```

同时把相关变量置零：

```css
html body uni-app.uni-app--showtabbar uni-page-body,
html body uni-page-body {
  --tab-bar-height: 0px !important;
  --uni-safe-area-inset-bottom: 0px !important;
  padding-bottom: 0 !important;
}
```

## 七、安全注意事项

后台接口一定要注意鉴权。

建议：

- 后台注册接口不要直接公开给任意客户端。
- 管理员注册应要求已有管理员 token 或后台白名单。
- `tokenSecret` 和 `passwordSecret` 不能为空。
- 不要把 `project.private.config.json` 提交到仓库。
- 云函数配置建议放入 `uni-config-center`。

示例配置目录：

```text
uniCloud-aliyun/cloudfunctions/common/uni-config-center/uni-id/config.json
```

## 八、项目亮点

这个项目有几个比较适合学习的点：

- 基于 uni-app x，适合学习新一代跨端开发方式。
- 商城前台和商家后台都有完整页面结构。
- 使用 uniCloud 云对象组织后端接口。
- 支持云端数据和本地 fallback 数据双模式。
- 商品示例图使用本地静态资源，不依赖外部图片域名。
- 处理了 H5 和微信小程序运行中的一些常见问题。
- UI 已经按商城业务场景重新美化。

## 九、后续可以扩展的功能

后续可以继续补充：

- 商品 SKU 规格选择
- 商品图片上传
- 真实支付流程
- 优惠券核销
- 拼团/秒杀库存锁定
- 订单物流轨迹
- 后台权限 RBAC
- 商品富文本详情
- 数据图表可视化
- 小程序正式发布配置

## 十、总结

这个项目从 uni-app x 基础工程扩展成了一个商城业务 Demo，覆盖了商城首页、商品详情、购物车、订单、登录注册、商家后台、商品管理、订单管理和 uniCloud 云对象接口。

如果你正在学习 uni-app x、微信小程序、H5 多端适配或 uniCloud 云对象开发，这个项目可以作为一个不错的练习基础。后续继续完善真实数据、支付、权限和上传能力，就可以逐步演进成更完整的商城系统。

## 推荐标题

发布到 CSDN 时可以使用下面这些标题：

```text
uni-app x 实战：从 0 到 1 搭建商城小程序 + 商家后台
基于 uni-app x + uniCloud 的商城项目实战，支持 H5 和微信小程序
uni-app x 商城项目开发记录：商品、购物车、订单、后台管理完整闭环
```

## 推荐标签

```text
uni-app x
uniCloud
微信小程序
Vue3
商城项目
HBuilderX
前端实战
```

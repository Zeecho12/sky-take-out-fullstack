# [0001] C 端认证改造:微信登录 → 本地账密 + JWT + Spring Security — Requirement

## 元信息
- 编号: 0001
- 类型: 技术升级
- 档位: T3
- 状态: 已交付
- 关联: Proposal → ./proposal.md | Progress → ./progress.md | ADR → ../../decisions/0001-cend-auth-local-jwt-spring-security.md

## 1. 背景与动机 (Why)
苍穹外卖 C 端登录是微信小程序登录(`wx.login` 拿 code → 后端换 openid → 以 openid 作账号键)。
三点不适合作北美后端 SDE 简历项目:
① 强依赖外部微信服务——没合法 appid/secret 跑不通,面试现场演示困难;
② openid 是微信特定概念,北美技术栈无对应物,讲不出通用价值;
③ 鉴权是手写拦截器,没用行业标准安全框架,技术深度不足以当亮点。

## 2. 目标 (What)
把 C 端认证从"微信 code 登录"换成"本地账密登录",并把全站鉴权从手写拦截器升级为
Spring Security 统管、统一为无状态 JWT。让项目脱离微信可独立演示,Spring Security 成为简历亮点。

## 3. 范围 (Scope)
### 做什么 (In Scope)
- C 端账密 注册 / 登录 / 登出 / 改密
- Spring Security 统管全站授权(`/admin/**` = ADMIN、`/user/**` = USER)
- admin 端认证头迁移到 `Authorization: Bearer`
- 最小 C 端 Web(Vue3+Vite)联调打通
### 不做什么 (Out of Scope)
- 微信支付 / openid 依赖 → 留给 0002
- OAuth2 社交登录 → 将来
- Redis 黑名单式彻底登出 → 将来增强

## 4. 验收标准 (Acceptance Criteria)
- [x] C 端能用账密完成注册/登录/登出/改密,返回统一 `Result` + Bearer JWT
- [x] `/admin/**` 需 ADMIN、`/user/**` 需 USER;白名单端点免认证
- [x] 无 token 访问受保护端点 → 401;角色不符 → 403(负例)
- [x] admin 端改造后仍能登录并带鉴权访问(回归)
- [x] 最小 C 端 Web 跑通 注册/登录/改密/登出 全链路

## 核心功能识别

选定功能：用户注册（User Registration）
选择理由：本项目名为"用户中心"，其核心价值就是用户账号的管理。在注册、登录、注销、查询四个接口中，注册是技术复杂度最高的——它涉及 7 项参数校验、正则表达式过滤、数据库唯一性检查（2 次查询）、MD5 加盐密码加密、synchronized 线程安全控制、以及最终的数据库写入，完整覆盖了 Controller → Service → Mapper → MySQL 的全栈调用链。
备选功能：用户登录（userLogin）——涉及密码加密比对、数据库查询、用户脱敏、Session 写入，也是一条不错的学习链路，可作为替代切入点。

## 完整调用链

```
POST /api/user/register  ──  用户发起注册请求
  │ 完整路径来源：context-path=/api + 类级 @RequestMapping("/user") + 方法级 @PostMapping("/register")
  ▼
[UserController]  ──  基础参数非空校验，从 UserRegisterRequest 中提取字段，转发给 Service
  src/main/java/com/yupi/usercenter/controller/UserController.java
  │
  ▼
[UserServiceImpl]  ──  核心业务逻辑：7 项参数校验 → 账号/星球编号唯一性检查 → MD5 加盐加密 → 插入用户记录
  src/main/java/com/yupi/usercenter/service/impl/UserServiceImpl.java
  │
  ├──▶(同步) this.count(queryWrapper)  ──  查询 userAccount 是否已存在
  │         │  （this.count() 继承自 MyBatis-Plus 的 ServiceImpl，内部调用 UserMapper）
  │         ▼
  │       [UserMapper]  ──  SELECT COUNT(*) FROM user WHERE userAccount = ?
  │         src/main/java/com/yupi/usercenter/mapper/UserMapper.java
  │         │
  │         ▼
  │       [MySQL: user 表]
  │
  ├──▶(同步) this.count(queryWrapper)  ──  查询 planetCode 是否已存在
  │         │
  │         ▼
  │       [UserMapper]  ──  SELECT COUNT(*) FROM user WHERE planetCode = ?
  │         │
  │         ▼
  │       [MySQL: user 表]
  │
  ├──▶(同步) DigestUtils.md5DigestAsHex()  ──  对密码进行 MD5 + 盐值加密
  │
  ├──▶(同步) this.save(user)  ──  将新用户记录插入数据库
  │         │  （this.save() 继承自 MyBatis-Plus 的 ServiceImpl，内部调用 UserMapper）
  │         ▼
  │       [UserMapper]  ──  INSERT INTO user (userAccount, userPassword, planetCode) VALUES (?, ?, ?)
  │         │
  │         ▼
  │       [MySQL: user 表]  ──  执行 INSERT，返回自增主键 id
  │
  ▼(原路返回 user.getId())
HTTP 200  {code: 0, data: 新用户ID, message: "ok"}
```

说明：本流程为纯同步调用链，无异步分支。`this.count()` 和 `this.save()` 均继承自 MyBatis-Plus 的 `ServiceImpl<UserMapper, User>`，在运行时通过 `UserMapper` 代理执行 SQL。整个 `userRegister` 方法体被包裹在 `synchronized (userAccount.intern())` 块中，以 userAccount 字符串为锁对象，防止并发注册相同账号时绕过唯一性校验。

## 节点详解

📍 节点 1：UserController
   文件路径：src/main/java/com/yupi/usercenter/controller/UserController.java
   类级别注解：@RestController, @RequestMapping("/user")
   在这里做了什么：接收前端 POST 请求，从 @RequestBody 反序列化的 UserRegisterRequest 中提取 userAccount、userPassword、checkPassword、planetCode 四个字段，做基础非空校验后调用 Service 层的 userRegister 方法，将返回的用户 ID 包装成统一响应返回。
   关键代码片段：
   ```java
   @PostMapping("/register")
   public BaseResponse<Long> userRegister(@RequestBody UserRegisterRequest userRegisterRequest) {
       if (userRegisterRequest == null) {
           throw new BusinessException(ErrorCode.PARAMS_ERROR);
       }
       String userAccount = userRegisterRequest.getUserAccount();
       String userPassword = userRegisterRequest.getUserPassword();
       String checkPassword = userRegisterRequest.getCheckPassword();
       String planetCode = userRegisterRequest.getPlanetCode();
       if (StringUtils.isAnyBlank(userAccount, userPassword, checkPassword, planetCode)) {
           return null;
       }
       long result = userService.userRegister(userAccount, userPassword, checkPassword, planetCode);
       return ResultUtils.success(result);
   }
   ```

📍 节点 2：UserServiceImpl
   文件路径：src/main/java/com/yupi/usercenter/service/impl/UserServiceImpl.java
   在这里做了什么：（标注 @Service、@Slf4j，继承 ServiceImpl<UserMapper, User>）执行注册核心业务逻辑——7 项参数校验（非空、长度、特殊字符、密码一致性）→ synchronized 块内查询数据库确保 userAccount 和 planetCode 唯一 → 使用固定盐值 "yupi" + MD5 加密密码 → 构造 User 对象并调用 this.save() 写入数据库 → 返回新用户 ID。
   关键代码片段：
   ```java
   synchronized (userAccount.intern()) {
       QueryWrapper<User> queryWrapper = new QueryWrapper<>();
       queryWrapper.eq("userAccount", userAccount);
       long count = this.count(queryWrapper);
       if (count > 0) {
           throw new BusinessException(ErrorCode.PARAMS_ERROR, "账号重复");
       }
       // ... 星球编号唯一性检查（同上模式）
       String encryptPassword = DigestUtils.md5DigestAsHex((SALT + userPassword).getBytes());
       User user = new User();
       user.setUserAccount(userAccount);
       user.setUserPassword(encryptPassword);
       user.setPlanetCode(planetCode);
       boolean saveResult = this.save(user);
       if (!saveResult) {
           throw new BusinessException(ErrorCode.SYSTEM_ERROR, "注册失败，数据库错误");
       }
       return user.getId();
   }
   ```

📍 节点 3：UserMapper
   文件路径：src/main/java/com/yupi/usercenter/mapper/UserMapper.java
   在这里做了什么：本接口无自定义方法，所有 CRUD 操作由 MyBatis-Plus 的 `BaseMapper` 自动提供（`insert`、`selectCount`、`selectOne`、`selectList`、`deleteById` 等）。在注册流程中，被 `ServiceImpl.count()` 调用执行 `SELECT COUNT(*)` 查询，被 `ServiceImpl.save()` 调用执行 `INSERT` 插入。
   关键代码片段：
   ```java
   public interface UserMapper extends BaseMapper<User> {

   }
   ```

📍 节点 4：MySQL — user 表
   文件路径：sql/create_table.sql（建表脚本）
   在这里做了什么：作为持久化存储，接收并执行 MyBatis-Plus 生成的 SQL 语句。在注册流程中依次执行：① `SELECT COUNT(*) FROM user WHERE userAccount = ?`（账号唯一性）→ ② `SELECT COUNT(*) FROM user WHERE planetCode = ?`（星球编号唯一性）→ ③ `INSERT INTO user (userAccount, userPassword, planetCode) VALUES (?, ?, ?)`（写入新用户），并返回自增主键 id。
   关键信息：
   - 数据库名：yupi（本地）/ user_center（生产）
   - 表名：user，共 14 个字段（id, username, userAccount, avatarUrl, gender, userPassword, phone, email, userStatus, createTime, updateTime, isDelete, userRole, planetCode）
   - 逻辑删除字段：isDelete（0=未删除，1=已删除）

## 流程类比

用户注册的完整流程，就像**在一家高端会员制俱乐部申请入会**：

1. 你来到俱乐部前台（**UserController**），把填好的入会申请表（UserRegisterRequest）交给前台。前台先瞄一眼表格有没有漏填的——如果姓名、密码、确认密码、推荐编号有任何一项是空白的，直接退回，连会员主管都不用叫。

2. 前台确认表格基本完整后，转交给会员主管（**UserServiceImpl**）。主管是整个流程的核心人物，他要做一系列严格审核：
   - 检查你的会员名是不是太短（< 4 个字符）、密码是不是太弱（< 8 位）、有没有用奇怪的特殊符号、两次密码是否一致——这就像俱乐部的入会标准审查。
   - 然后主管锁上办公室门（`synchronized`），打电话给档案室确认"这个会员名有没有人用过"、"这个推荐编号有没有被占用"——必须锁门是因为怕两个申请人同时提交同一个名字，都被告知"可用"，结果注册了两个重名会员。
   - 审核通过后，主管把你的原始密码放进一台加密机（MD5 + 盐值），生成一串密文——俱乐部的档案里永远不会存你的真实密码。
   - 最后主管把加密后的信息交给档案管理员去归档。

3. 档案管理员（**UserMapper**）本人其实什么都不干——他只是继承了一整套标准化的档案操作流程手册（BaseMapper），拿着主管给的信息，按标准流程把资料送进档案库。

4. 档案库（**MySQL user 表**）是最终存放所有会员资料的地方。管理员先查两次档案确认没有重名和重复编号，然后把新会员的资料写入档案，分配一个唯一的会员编号（自增 id）。

5. 会员编号一路返回——档案库 → 档案管理员 → 会员主管 → 前台 → 你。前台把编号装进统一格式的信封（BaseResponse），递给你。入会成功！

**角色对应关系：**
- 俱乐部前台 = **UserController**：接收请求、基础检查、转发
- 会员主管 = **UserServiceImpl**：核心审核逻辑、加密、线程安全控制
- 档案管理员 = **UserMapper**：标准化数据操作代理（BaseMapper 提供能力）
- 档案库 = **MySQL user 表**：最终数据持久化存储
- 加密机 = **DigestUtils.md5DigestAsHex() + SALT**：密码加密工具（不是调用链节点，但是关键安全环节）

# sky-take-out（苍穹外卖） FILE_INDEX
<!-- 由 backend-scan-7a-brief 派生，读者为下游 AI Skill；按类型的文件路径索引 -->
<!-- 每条：- <完整路径>  [SOURCE: SECTION-N(位置)]；零编造（每条可在 S1~5/S4B 找到来源）、零遗漏（S3 各模块完整文件清单里每个 .java 均已归类） -->

## A.1 启动类
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\SkyApplication.java  [SOURCE: SECTION-3(启动类注解分析 / sky-server 卡片)]

## A.2 Controller
### admin（后台管理端）
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\admin\CategoryController.java  [SOURCE: SECTION-3(controller 卡片), SECTION-4(API 路径概览)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\admin\CommonController.java  [SOURCE: SECTION-3(controller 卡片), SECTION-4(API 路径概览)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\admin\DishController.java  [SOURCE: SECTION-3(controller 卡片), SECTION-4(API 路径概览)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\admin\EmployeeController.java  [SOURCE: SECTION-3(controller 卡片), SECTION-4(API 路径概览)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\admin\OrderController.java  [SOURCE: SECTION-3(controller 卡片), SECTION-4(API 路径概览)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\admin\ReportController.java  [SOURCE: SECTION-3(controller 卡片), SECTION-4(API 路径概览)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\admin\SetmealController.java  [SOURCE: SECTION-3(controller 卡片), SECTION-4(API 路径概览), SECTION-5(@CacheEvict 写侧配套·未展开)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\admin\ShopController.java  [SOURCE: SECTION-3(controller 卡片), SECTION-4(API 路径概览)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\admin\WorkSpaceController.java  [SOURCE: SECTION-3(controller 卡片), SECTION-4(API 路径概览)]
### notify（第三方回调）
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\notify\PayNotifyController.java  [SOURCE: SECTION-3(controller 卡片), SECTION-4(对外入口 / API 路径概览), SECTION-5(未展开候选)]
### user（C 端顾客）
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\user\AddressBookController.java  [SOURCE: SECTION-3(controller 卡片), SECTION-4(API 路径概览)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\user\CategoryController.java  [SOURCE: SECTION-3(controller 卡片), SECTION-4(API 路径概览)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\user\DishController.java  [SOURCE: SECTION-3(controller 卡片), SECTION-4(API 路径概览), SECTION-5(未展开·手动 Redis 缓存)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\user\OrderController.java  [SOURCE: SECTION-3(controller 卡片), SECTION-4(API 路径概览), SECTION-5(主链节点 1)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\user\SetmealController.java  [SOURCE: SECTION-3(controller 卡片), SECTION-4(API 路径概览), SECTION-5(浅链 3 缓存)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\user\ShopController.java  [SOURCE: SECTION-3(controller 卡片), SECTION-4(API 路径概览)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\user\ShoppingCartController.java  [SOURCE: SECTION-3(controller 卡片), SECTION-4(API 路径概览)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\user\UserController.java  [SOURCE: SECTION-3(controller 卡片), SECTION-4(API 路径概览)]

## A.3 Service（接口与实现）
### 业务 Service 接口
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\service\AddressBookService.java  [SOURCE: SECTION-3(service 卡片)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\service\CategoryService.java  [SOURCE: SECTION-3(service 卡片)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\service\DishService.java  [SOURCE: SECTION-3(service 卡片)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\service\EmployeeService.java  [SOURCE: SECTION-3(service 卡片)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\service\OrderService.java  [SOURCE: SECTION-3(service 卡片)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\service\ReportService.java  [SOURCE: SECTION-3(service 卡片)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\service\SetmealService.java  [SOURCE: SECTION-3(service 卡片)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\service\ShoppingCartService.java  [SOURCE: SECTION-3(service 卡片)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\service\UserService.java  [SOURCE: SECTION-3(service 卡片)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\service\WorkspaceService.java  [SOURCE: SECTION-3(service 卡片)]
### 业务 Service 实现（impl）
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\service\impl\AddressBookServiceImpl.java  [SOURCE: SECTION-3(service 卡片)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\service\impl\CategoryServiceImpl.java  [SOURCE: SECTION-3(service 卡片)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\service\impl\DishServiceImpl.java  [SOURCE: SECTION-3(service 卡片)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\service\impl\EmployeeServiceImpl.java  [SOURCE: SECTION-3(service 卡片)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\service\impl\OrderServiceImpl.java  [SOURCE: SECTION-3(service 卡片), SECTION-5(主链节点 2 + 浅链 2 推送 reminder/paySuccess)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\service\impl\ReportServiceImpl.java  [SOURCE: SECTION-3(service 卡片), SECTION-5(未展开·报表聚合)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\service\impl\SetmealServiceImpl.java  [SOURCE: SECTION-3(service 卡片)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\service\impl\ShoppingCartServiceImpl.java  [SOURCE: SECTION-3(service 卡片)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\service\impl\UserServiceImpl.java  [SOURCE: SECTION-3(service 卡片)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\service\impl\WorkspaceServiceImpl.java  [SOURCE: SECTION-3(service 卡片)]
### Spring Security 服务实现
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\security\UserDetailsServiceImpl.java  [SOURCE: SECTION-3(security 卡片)] —— Spring Security `UserDetailsService` 实现，按用户名查库加载账号

## A.4 Mapper·DAO
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\mapper\AddressBookMapper.java  [SOURCE: SECTION-3(mapper 卡片), SECTION-5(主链同步①)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\mapper\CategoryMapper.java  [SOURCE: SECTION-3(mapper 卡片)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\mapper\DishFlavorMapper.java  [SOURCE: SECTION-3(mapper 卡片)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\mapper\DishMapper.java  [SOURCE: SECTION-3(mapper 卡片)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\mapper\EmployeeMapper.java  [SOURCE: SECTION-3(mapper 卡片)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\mapper\OrderDetailMapper.java  [SOURCE: SECTION-3(mapper 卡片), SECTION-5(主链同步⑤)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\mapper\OrderMapper.java  [SOURCE: SECTION-3(mapper 卡片), SECTION-5(主链节点 3 ★代表性 Mapper)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\mapper\SetmealDishMapper.java  [SOURCE: SECTION-3(mapper 卡片)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\mapper\SetmealMapper.java  [SOURCE: SECTION-3(mapper 卡片)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\mapper\ShoppingCartMapper.java  [SOURCE: SECTION-3(mapper 卡片), SECTION-5(主链同步③/⑥)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\mapper\UserMapper.java  [SOURCE: SECTION-3(mapper 卡片)]

## A.5 Domain·Entity·PO
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\entity\AddressBook.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.1 实体↔表映射)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\entity\Category.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.1 实体↔表映射)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\entity\Dish.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.1 实体↔表映射)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\entity\DishFlavor.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.1 实体↔表映射)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\entity\Employee.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.1 实体↔表映射)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\entity\OrderDetail.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.1 实体↔表映射)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\entity\Orders.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.1 实体↔表映射)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\entity\Setmeal.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.1 实体↔表映射)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\entity\SetmealDish.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.1 实体↔表映射)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\entity\ShoppingCart.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.1 实体↔表映射)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\entity\User.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.1 实体↔表映射)]

## A.6 DTO·Request·VO
### DTO / Query（入参，23 个）
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\dto\CategoryDTO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\dto\CategoryPageQueryDTO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\dto\DataOverViewQueryDTO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\dto\DishDTO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\dto\DishPageQueryDTO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\dto\EmployeeDTO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\dto\EmployeeLoginDTO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\dto\EmployeePageQueryDTO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\dto\GoodsSalesDTO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\dto\OrdersCancelDTO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\dto\OrdersConfirmDTO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\dto\OrdersDTO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\dto\OrdersPageQueryDTO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\dto\OrdersPaymentDTO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\dto\OrdersRejectionDTO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\dto\OrdersSubmitDTO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3), SECTION-5(主链请求体)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\dto\PasswordEditDTO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\dto\SetmealDTO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\dto\SetmealPageQueryDTO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\dto\ShoppingCartDTO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\dto\UserChangePasswordDTO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\dto\UserLoginDTO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\dto\UserRegisterDTO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
### VO（出参，17 个）
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\vo\BusinessDataVO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\vo\DishItemVO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\vo\DishOverViewVO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\vo\DishVO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\vo\EmployeeLoginVO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\vo\OrderOverViewVO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\vo\OrderPaymentVO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\vo\OrderReportVO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\vo\OrderStatisticsVO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\vo\OrderSubmitVO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3), SECTION-5(主链返回体)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\vo\OrderVO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\vo\SalesTop10ReportVO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\vo\SetmealOverViewVO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\vo\SetmealVO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\vo\TurnoverReportVO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\vo\UserReportVO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]
- D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\vo\UserLoginVO.java  [SOURCE: SECTION-3(sky-pojo 卡片), SECTION-6(6.3)]

## A.7 Exception
### 自定义业务异常（sky-common/exception，均继承 BaseException）
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\exception\AccountLockedException.java  [SOURCE: SECTION-3(sky-common 卡片)]
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\exception\AccountNotFoundException.java  [SOURCE: SECTION-3(sky-common 卡片)]
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\exception\AddressBookBusinessException.java  [SOURCE: SECTION-3(sky-common 卡片), SECTION-5(主链同步①异常分支)]
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\exception\BaseException.java  [SOURCE: SECTION-3(sky-common 卡片)]
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\exception\DeletionNotAllowedException.java  [SOURCE: SECTION-3(sky-common 卡片)]
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\exception\LoginFailedException.java  [SOURCE: SECTION-3(sky-common 卡片)]
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\exception\OrderBusinessException.java  [SOURCE: SECTION-3(sky-common 卡片), SECTION-5(主链同步②/③异常分支)]
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\exception\PasswordEditFailedException.java  [SOURCE: SECTION-3(sky-common 卡片)]
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\exception\PasswordErrorException.java  [SOURCE: SECTION-3(sky-common 卡片)]
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\exception\SetmealEnableFailedException.java  [SOURCE: SECTION-3(sky-common 卡片)]
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\exception\ShoppingCartBusinessException.java  [SOURCE: SECTION-3(sky-common 卡片), SECTION-5(主链同步③异常分支)]
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\exception\UserNotLoginException.java  [SOURCE: SECTION-3(sky-common 卡片)]
### 全局异常处理器（sky-server/handler）
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\handler\GlobalExceptionHandler.java  [SOURCE: SECTION-3(handler 卡片)] —— `@RestControllerAdvice` 统一捕获异常 → Result 错误响应

## A.8 Common（响应封装·错误码·工具）
### 响应封装（sky-common/result）
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\result\PageResult.java  [SOURCE: SECTION-3(sky-common 卡片)]
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\result\Result.java  [SOURCE: SECTION-3(sky-common 卡片), SECTION-5(主链尾节点 Result{code:1})]
### 工具类（sky-common/utils）
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\utils\AliOssUtil.java  [SOURCE: SECTION-3(sky-common 卡片)]
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\utils\HttpClientUtil.java  [SOURCE: SECTION-3(sky-common 卡片), SECTION-5(主链同步②百度地图 doGet)]
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\utils\JwtUtil.java  [SOURCE: SECTION-3(sky-common 卡片), SECTION-5(浅链 1 parseJWT)]
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\utils\WeChatPayUtil.java  [SOURCE: SECTION-3(sky-common 卡片)]
### 线程上下文（sky-common/context）
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\context\BaseContext.java  [SOURCE: SECTION-3(sky-common 卡片), SECTION-5(浅链 1 setCurrentId / 主链 getCurrentId)] —— ThreadLocal 当前登录用户上下文
### 序列化定制（sky-common/json）
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\json\JacksonObjectMapper.java  [SOURCE: SECTION-3(sky-common 卡片)] —— Jackson 序列化定制

## A.9 Constant·Enum
### 常量（sky-common/constant）
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\constant\AutoFillConstant.java  [SOURCE: SECTION-3(sky-common 卡片)]
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\constant\JwtClaimsConstant.java  [SOURCE: SECTION-3(sky-common 卡片)]
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\constant\MessageConstant.java  [SOURCE: SECTION-3(sky-common 卡片)]
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\constant\PasswordConstant.java  [SOURCE: SECTION-3(sky-common 卡片)]
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\constant\StatusConstant.java  [SOURCE: SECTION-3(sky-common 卡片), SECTION-5(浅链 3 StatusConstant.ENABLE)]
### 枚举（sky-common/enumeration）
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\enumeration\OperationType.java  [SOURCE: SECTION-3(sky-common 卡片 / annotation·aspect 卡片)]

## A.10 Config·AOP·Filter·Interceptor·Listener
### 配置类（sky-server/config）
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\config\OssConfiguration.java  [SOURCE: SECTION-3(config 卡片)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\config\RedisConfiguration.java  [SOURCE: SECTION-3(config 卡片), SECTION-5(浅链 3 缓存后端)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\config\SecurityConfig.java  [SOURCE: SECTION-3(config 卡片), SECTION-5(浅链 1 授权规则)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\config\WebMvcConfiguration.java  [SOURCE: SECTION-3(config 卡片)]
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\config\WebSocketConfiguration.java  [SOURCE: SECTION-3(config 卡片), SECTION-4(非 REST 入口), SECTION-5(浅链 2 端点注册)]
### AOP 切面（sky-server/aspect）
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\aspect\AutoFillAspect.java  [SOURCE: SECTION-3(aspect 卡片)]
### 自定义注解（sky-server/annotation，AOP 切点标记）
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\annotation\AutoFill.java  [SOURCE: SECTION-3(annotation 卡片)] —— `@AutoFill` 标记需自动填充公共字段的 Mapper 方法
### Security 过滤器（sky-server/security）
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\security\JwtAuthenticationFilter.java  [SOURCE: SECTION-3(security 卡片), SECTION-5(浅链 1 有意思的节点)] —— 继承 OncePerRequestFilter 的 JWT 过滤器
### 配置属性绑定类（sky-common/properties，@ConfigurationProperties）
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\properties\AliOssProperties.java  [SOURCE: SECTION-3(sky-common 卡片)]
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\properties\JwtProperties.java  [SOURCE: SECTION-3(sky-common 卡片), SECTION-5(浅链 1 getSecretKey)]
- D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\properties\WeChatProperties.java  [SOURCE: SECTION-3(sky-common 卡片)]

## A.11 特殊子系统·其他业务核心类
### Spring Security 登录主体（sky-server/security）
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\security\LoginUser.java  [SOURCE: SECTION-3(security 卡片)] —— `UserDetails` 实现，承载登录主体（归不进 A.1~A.10，安全子系统模型对象）
### 定时任务（sky-server/task，@Scheduled）
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\task\MyTask.java  [SOURCE: SECTION-3(task 卡片), SECTION-4(定时任务)] —— 示例任务
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\task\OrderTask.java  [SOURCE: SECTION-3(task 卡片), SECTION-4(定时任务), SECTION-5(未展开·定时任务)] —— 订单超时未支付/派送中状态流转
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\task\WebSocketTask.java  [SOURCE: SECTION-3(task 卡片), SECTION-4(定时任务)] —— WebSocket 心跳
### WebSocket 推送端点（sky-server/websocket，@ServerEndpoint）
- D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\websocket\WebSocketServer.java  [SOURCE: SECTION-3(websocket 卡片), SECTION-4(非 REST 入口 ws://localhost:8080/ws/{sid}), SECTION-5(浅链 2 有意思的节点)]

## A.12 配置文件
- D:\CQWM2\sky-take-out\pom.xml  [SOURCE: SECTION-1(构建与部署 / 根聚合父 POM), SECTION-2(依赖扫描来源)]
- D:\CQWM2\sky-take-out\sky-common\pom.xml  [SOURCE: SECTION-2(依赖扫描来源)]
- D:\CQWM2\sky-take-out\sky-pojo\pom.xml  [SOURCE: SECTION-2(依赖扫描来源)]
- D:\CQWM2\sky-take-out\sky-server\pom.xml  [SOURCE: SECTION-2(依赖扫描来源)]
- D:\CQWM2\sky-take-out\sky-server\src\main\resources\application.yml  [SOURCE: SECTION-4(配置文件一览 / 关键配置项索引 公共骨架)]
- D:\CQWM2\sky-take-out\sky-server\src\main\resources\application-dev.yml  [SOURCE: SECTION-4(配置文件一览 / 关键配置项索引 dev 填值)]
- D:\CQWM2\sky-take-out\sky-server\src\main\resources\mapper\*.xml  [SOURCE: SECTION-4(mybatis.mapper-locations: classpath:mapper/*.xml), SECTION-3(mapper 卡片：同名 11 个 XML)] —— MyBatis 运行时 SQL 映射（11 个，与 Mapper 接口同名；非建表 schema）

## A.13 SQL·Schema 文件
- D:\CQWM2\sky.sql  [SOURCE: SECTION-1(数据库脚本索引), SECTION-4(数据库 Schema 索引), SECTION-6/S4B(全库建表脚本·真相源)] —— 全库建表脚本 + 少量内联 INSERT（功能 0001 改造后最终形态）
- D:\CQWM2\docs\features\0001-cend-auth-jwt\0001-migration.sql  [SOURCE: SECTION-1(数据库脚本索引), SECTION-4(数据库 Schema 索引), SECTION-6/S4B(功能 0001 增量迁移)] —— user 表加 username/password/idx_username + employee admin 密码 BCrypt 迁移（幂等可重跑）

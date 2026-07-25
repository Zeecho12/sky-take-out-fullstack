package com.sky.controller.user;

import com.sky.dto.UserChangePasswordDTO;
import com.sky.dto.UserLoginDTO;
import com.sky.dto.UserRegisterDTO;
import com.sky.result.Result;
import com.sky.service.UserService;
import com.sky.vo.UserLoginVO;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/user/user")
@Api(tags = "C端用户相关接口")
@Slf4j
public class UserController {

    @Autowired
    private UserService userService;

    @PostMapping("/register")
    @ApiOperation("用户注册")
    public Result<UserLoginVO> register(@RequestBody UserRegisterDTO userRegisterDTO) {
        log.info("C端注册:{}", userRegisterDTO.getUsername());
        return Result.success(userService.register(userRegisterDTO));
    }

    @PostMapping("/login")
    @ApiOperation("账号密码登录")
    public Result<UserLoginVO> login(@RequestBody UserLoginDTO userLoginDTO) {
        log.info("C端登录:{}", userLoginDTO.getUsername());
        return Result.success(userService.login(userLoginDTO));
    }

    @PutMapping("/password")
    @ApiOperation("修改密码")
    public Result changePassword(@RequestBody UserChangePasswordDTO userChangePasswordDTO) {
        userService.changePassword(userChangePasswordDTO);
        return Result.success();
    }

    @PostMapping("/logout")
    @ApiOperation("退出登录")
    public Result logout() {
        // 无状态 JWT:后端不持状态,前端丢弃本地 token 即可
        return Result.success();
    }
}

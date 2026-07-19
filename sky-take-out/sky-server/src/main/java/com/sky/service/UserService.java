package com.sky.service;

import com.sky.dto.UserChangePasswordDTO;
import com.sky.dto.UserLoginDTO;
import com.sky.dto.UserRegisterDTO;
import com.sky.vo.UserLoginVO;

public interface UserService {
    UserLoginVO register(UserRegisterDTO userRegisterDTO);
    UserLoginVO login(UserLoginDTO userLoginDTO);
    void changePassword(UserChangePasswordDTO userChangePasswordDTO);
}

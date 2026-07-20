package com.sky.service.impl;

import com.sky.constant.MessageConstant;
import com.sky.context.BaseContext;
import com.sky.dto.UserChangePasswordDTO;
import com.sky.dto.UserLoginDTO;
import com.sky.dto.UserRegisterDTO;
import com.sky.entity.User;
import com.sky.exception.AccountNotFoundException;
import com.sky.exception.BaseException;
import com.sky.exception.LoginFailedException;
import com.sky.exception.PasswordErrorException;
import com.sky.mapper.UserMapper;
import com.sky.properties.JwtProperties;
import com.sky.security.LoginUser;
import com.sky.service.UserService;
import com.sky.utils.JwtUtil;
import com.sky.vo.UserLoginVO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Service
@Slf4j
public class UserServiceImpl implements UserService {

    @Autowired
    private UserMapper userMapper;
    @Autowired
    private PasswordEncoder passwordEncoder;
    @Autowired
    private AuthenticationManager authenticationManager;
    @Autowired
    private JwtProperties jwtProperties;

    @Override
    public UserLoginVO register(UserRegisterDTO userRegisterDTO) {
        String username = userRegisterDTO.getUsername();
        if (userMapper.getByUsername(username) != null) {
            throw new BaseException("用户名" + MessageConstant.ALREADY_EXISTS);
        }
        User user = User.builder()
                .username(username)
                .password(passwordEncoder.encode(userRegisterDTO.getPassword()))
                .createTime(LocalDateTime.now())
                .build();
        userMapper.insert(user); // 回填自增 id
        String token = issueToken(user.getId());
        return UserLoginVO.builder().id(user.getId()).username(user.getUsername()).token(token).build();
    }

    @Override
    public UserLoginVO login(UserLoginDTO userLoginDTO) {
        Authentication authentication;
        try {
            authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(userLoginDTO.getUsername(), userLoginDTO.getPassword()));
        } catch (AuthenticationException e) {
            throw new LoginFailedException(MessageConstant.LOGIN_FAILED);
        }
        LoginUser loginUser = (LoginUser) authentication.getPrincipal();
        User user = loginUser.getUser();
        String token = issueToken(user.getId());
        return UserLoginVO.builder().id(user.getId()).username(user.getUsername()).token(token).build();
    }

    @Override
    public void changePassword(UserChangePasswordDTO userChangePasswordDTO) {
        Long userId = BaseContext.getCurrentId();
        if (userId == null) {
            throw new AccountNotFoundException(MessageConstant.ACCOUNT_NOT_FOUND);
        }
        User user = userMapper.getById(String.valueOf(userId));
        if (user == null) {
            throw new AccountNotFoundException(MessageConstant.ACCOUNT_NOT_FOUND);
        }
        if (!passwordEncoder.matches(userChangePasswordDTO.getOldPassword(), user.getPassword())) {
            throw new PasswordErrorException(MessageConstant.PASSWORD_ERROR);
        }
        userMapper.updatePassword(userId, passwordEncoder.encode(userChangePasswordDTO.getNewPassword()));
    }

    /**
     * 签发无状态 JWT:载荷 {sub:用户id, role:"USER", exp};单一 secret。
     */
    private String issueToken(Long userId) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("sub", String.valueOf(userId));
        claims.put("role", "USER");
        return JwtUtil.createJWT(jwtProperties.getSecretKey(), jwtProperties.getTtl(), claims);
    }
}

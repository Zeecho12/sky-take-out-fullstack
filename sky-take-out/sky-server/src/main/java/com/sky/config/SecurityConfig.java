package com.sky.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Spring Security 配置(工单 0001 步骤2:骨架)。
 *
 * 本步只做"骨架 + 项目仍能启动":
 *  - Spring Security 一进 classpath 会默认锁全站,这里显式放行所有请求
 *    (anyRequest().permitAll()),让现有手写拦截器
 *    (JwtTokenAdminInterceptor / JwtTokenUserInterceptor)继续在 MVC 层管鉴权,
 *    行为与改造前一致,不破坏当前可用功能。
 *  - 无状态(STATELESS)+ 关闭 CSRF:为后续 JWT 无状态鉴权铺垫
 *    (Bearer token 不走 cookie,天然免疫 CSRF)。
 *
 * 真正的授权规则(/admin/** = ADMIN、/user/** = USER)、JWT OncePerRequestFilter、
 * 删除两个手写拦截器 —— 都留到步骤4。
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf().disable()
                .sessionManagement().sessionCreationPolicy(SessionCreationPolicy.STATELESS)
                .and()
                .authorizeRequests()
                .anyRequest().permitAll();
        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}

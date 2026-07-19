package com.sky.config;

import com.sky.properties.JwtProperties;
import com.sky.security.JwtAuthenticationFilter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Spring Security 配置(工单 0001)。
 * 步骤2:骨架 + permitAll。
 * 步骤3:加 JWT 认证过滤器(Bearer -> SecurityContext + BaseContext)与 AuthenticationManager。
 * 步骤4(本次):加授权规则(/admin=ADMIN,/user=USER)+ 白名单 + 401/403。
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Autowired
    private JwtProperties jwtProperties;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf().disable()
                .sessionManagement().sessionCreationPolicy(SessionCreationPolicy.STATELESS)
                .and()
                .authorizeRequests()
                // 免认证白名单(必须在 /admin/**、/user/** 规则之前)
                .antMatchers(
                        "/admin/employee/login",
                        "/user/user/login",
                        "/user/user/register",
                        "/user/shop/status").permitAll()
                // 角色授权
                .antMatchers("/admin/**").hasRole("ADMIN")
                .antMatchers("/user/**").hasRole("USER")
                // 其余(knife4j /doc.html、/webjars/**、/swagger-resources、/v2/api-docs、支付回调、websocket 等)放行
                .anyRequest().permitAll()
                .and()
                // 401:未认证/令牌无效;403:已认证但无权限
                .exceptionHandling()
                .authenticationEntryPoint((request, response, ex) -> {
                    response.setStatus(401);
                    response.setContentType("application/json;charset=UTF-8");
                    response.getWriter().write("{\"code\":0,\"msg\":\"未认证或令牌无效\",\"data\":null}");
                })
                .accessDeniedHandler((request, response, ex) -> {
                    response.setStatus(403);
                    response.setContentType("application/json;charset=UTF-8");
                    response.getWriter().write("{\"code\":0,\"msg\":\"无访问权限\",\"data\":null}");
                })
                .and()
                .addFilterBefore(new JwtAuthenticationFilter(jwtProperties),
                        UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration configuration) throws Exception {
        return configuration.getAuthenticationManager();
    }
}

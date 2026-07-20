package com.sky.security;

import com.sky.context.BaseContext;
import com.sky.properties.JwtProperties;
import com.sky.utils.JwtUtil;
import io.jsonwebtoken.Claims;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Collections;

/**
 * 无状态 JWT 认证过滤器:从 Authorization: Bearer 读 token,校验通过则把身份填入
 * SecurityContext(权限 ROLE_<role>)与 BaseContext(当前用户 id)。
 * 授权由后续(步骤4)的 SecurityFilterChain 规则决定;本过滤器只做认证。
 */
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtProperties jwtProperties;

    public JwtAuthenticationFilter(JwtProperties jwtProperties) {
        this.jwtProperties = jwtProperties;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            String token = header.substring(7);
            try {
                Claims claims = JwtUtil.parseJWT(jwtProperties.getSecretKey(), token);
                Long userId = Long.valueOf(String.valueOf(claims.get("sub")));
                Object roleObj = claims.get("role");
                String role = roleObj == null ? null : roleObj.toString();

                UsernamePasswordAuthenticationToken authentication =
                        new UsernamePasswordAuthenticationToken(
                                userId,
                                null,
                                role == null ? Collections.emptyList()
                                        : Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + role)));
                authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authentication);
                BaseContext.setCurrentId(userId);
            } catch (Exception e) {
                // token 无效/过期:不填充身份(授权阶段再决定放行或拒绝),清理上下文
                SecurityContextHolder.clearContext();
            }
        }
        try {
            filterChain.doFilter(request, response);
        } finally {
            BaseContext.removeCurrentId();
        }
    }
}

package com.sky.properties;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "sky.jwt")
@Data
public class JwtProperties {

    /**
     * C端本地账密登录统一 JWT 配置(工单 0001,单套 secret)
     */
    private String secretKey;
    private long ttl;

}

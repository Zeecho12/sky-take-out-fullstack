package com.sky.dto;

import lombok.Data;

import java.io.Serializable;

@Data
public class UserChangePasswordDTO implements Serializable {
    private String oldPassword;
    private String newPassword;
}

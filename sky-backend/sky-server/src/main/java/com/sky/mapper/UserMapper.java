package com.sky.mapper;

import com.sky.entity.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.Map;

@Mapper
public interface UserMapper {
    /**
     * 根据id获取用户信息
     * @param id
     * @return
     */
    User getById(String id);

    /**
     * 根据openid获取当前用户
     * @param openid
     * @return
     */
    User getByOpenId(@Param("openid") String openid);

    /**
     * 根据用户名获取用户(C端本地账密登录)
     * @param username
     * @return
     */
    User getByUsername(@Param("username") String username);

    /**
     * 修改用户密码
     * @param id
     * @param password
     */
    void updatePassword(@Param("id") Long id, @Param("password") String password);

    /**
     * 创建新用户
     * 说明:User 无 createUser/updateUser/updateTime 审计字段,不适用 @AutoFill(INSERT);
     *      createTime 由 service 层(register)手动设置。
     * @param user
     */
    void insert(User user);

    /**
     * 根据动态条件统计用户数量
     * @param map
     * @return
     */
    Integer countByMap(Map map);
}

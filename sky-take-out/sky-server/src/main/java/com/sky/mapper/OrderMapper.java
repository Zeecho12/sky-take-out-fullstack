package com.sky.mapper;

import com.github.pagehelper.Page;
import com.sky.dto.GoodsSalesDTO;
import com.sky.dto.OrdersPageQueryDTO;
import com.sky.entity.Orders;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Mapper
public interface OrderMapper {
    /**
     * 插入订单数据
     * @param order
     */
    void insert(Orders order);

    /**
     * 根据订单号和用户id查询订单
     * @param orderNumber
     * @param userId
     * @return
     */
    Orders getByNumberAndUserId(@Param("orderNumber") String orderNumber, @Param("userId") Long userId);

    /**
     * 原子 CAS 置已支付:仅当订单存在、归属该用户、且当前未支付(pay_status=0)时,
     * 一条 SQL 置 status=待接单(2)/pay_status=已支付(1)/checkout_time=now()。
     * @return 影响行数(1=本次置位成功;0=不存在/非本人/已支付)
     */
    int updateToPaidIfUnpaid(@Param("orderNumber") String orderNumber, @Param("userId") Long userId);

    /**
     * 修改订单信息
     * @param orders
     */
    void update(Orders orders);

    /**
     * 分页条件查询
     * @param ordersPageQueryDTO
     * @return
     */
    Page<Orders> pageQuery(OrdersPageQueryDTO ordersPageQueryDTO);

    /**
     * 根据id查询订单
     * @param id
     * @return
     */
    Orders getById(Long id);

    /**
     * 根据状态，分别查询出接待单，待派送、派送中的订单数量
     * @param status
     * @return
     */
    Integer countStatus(Integer status);

    /**
     * 根据状态和下单时间查询订单
     * @param status
     * @param orderTime
     */
    List<Orders> getByStatusAndOrderTime(@Param("status") Integer status, @Param("orderTime") LocalDateTime orderTime);

    /**
     * 根据动态条件统计营业额
     * @param map
     * @return
     */
    Double sumByMap(Map map);

    /**
     * 根据动态条件统计订单数量
     * @param map
     * @return
     */
    Integer countByMap(Map map);

    /**
     * 查询商品销量排名
     * @param begin
     * @param end
     */
    List<GoodsSalesDTO> getSalesTop10(LocalDateTime begin, LocalDateTime end);
}

package com.sky.service.impl;

import com.sky.context.BaseContext;
import com.sky.entity.AddressBook;
import com.sky.mapper.AddressBookMapper;
import com.sky.service.AddressBookService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class AddressBookServiceImpl implements AddressBookService {

    @Autowired
    private AddressBookMapper addressBookMapper;

    /**
     * 条件查询
     * @param addressBook
     * @return
     */
    @Override
    public List<AddressBook> list(AddressBook addressBook) {
        return addressBookMapper.list(addressBook);
    }

    /**
     * 新增地址
     * @param addressBook
     */
    @Override
    public void save(AddressBook addressBook) {
        addressBook.setUserId(BaseContext.getCurrentId());
        addressBook.setIsDefault(0);
        addressBookMapper.insert(addressBook);
    }

    /**
     * 根据id查询
     * @param id
     * @return
     */
    @Override
    public AddressBook getById(Long id) {
        AddressBook addressBook = addressBookMapper.getById(id);
        // 越权防护(IDOR):归属校验只认 ThreadLocal 里的当前登录用户,不信任任何请求参数。
        // 跨用户访问一律返回 null(返回空,不泄露他人数据)。
        Long currentId = BaseContext.getCurrentId();
        if (addressBook == null || !currentId.equals(addressBook.getUserId())) {
            return null;
        }
        return addressBook;
    }

    /**
     * 根据id修改地址
     * @param addressBook
     */
    @Override
    public void update(AddressBook addressBook) {
        // 越权防护(IDOR):强制用当前登录用户覆盖 body 里可能被伪造的 userId,
        // 配合 mapper.xml 的 where user_id = #{userId},乙改甲的地址匹配 0 行 → 无效。
        addressBook.setUserId(BaseContext.getCurrentId());
        addressBookMapper.update(addressBook);
    }

    /**
     * 设置默认地址
     * @param addressBook
     */
    @Override
    public void setDefault(AddressBook addressBook) {
        //1、将当前用户的所有地址修改为非默认地址 update address_book set is_default = ? where user_id = ?
        addressBook.setIsDefault(0);
        addressBook.setUserId(BaseContext.getCurrentId());
        addressBookMapper.updateIsDefaultByUserId(addressBook);

        //2、将当前地址改为默认地址 update address_book set is_default = ? where id = ?
        addressBook.setIsDefault(1);
        addressBookMapper.update(addressBook);
    }

    /**
     * 根据id删除地址
     * @param id
     */
    @Override
    public void deleteById(Long id) {
        // 越权防护(IDOR):deleteById mapper 是单参(被复用,不改签名),
        // 故在 Service 层先取回校验归属,归属不通过直接返回(不删、不泄露)。
        AddressBook addressBook = addressBookMapper.getById(id);
        Long currentId = BaseContext.getCurrentId();
        if (addressBook == null || !currentId.equals(addressBook.getUserId())) {
            return;
        }
        addressBookMapper.deleteById(id);
    }
}

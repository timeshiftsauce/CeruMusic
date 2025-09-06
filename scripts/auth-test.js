const axios = require('axios');

const ALIST_BASE_URL = 'http://47.96.72.224:5244';
const ALIST_USERNAME = 'ceruupdate';
const ALIST_PASSWORD = '123456';

async function test() {
  // 认证
  const auth = await axios.post(`${ALIST_BASE_URL}/api/auth/login`, {
    username: ALIST_USERNAME,
    password: ALIST_PASSWORD
  });
  
  const token = auth.data.data.token;
  console.log('Token received');

  // 测试直接 token 格式
  try {
    const list = await axios.post(`${ALIST_BASE_URL}/api/fs/list`, {
      path: '/',
      password: '',
      page: 1,
      per_page: 30,
      refresh: false
    }, {
      headers: { 'Authorization': token }
    });
    
    console.log('Direct token works:', list.data.code === 200);
    if (list.data.code === 200) {
      console.log('Files:', list.data.data.content.map(f => f.name));
    }
  } catch (e) {
    console.log('Direct token failed');
  }

  // 测试 Bearer 格式
  try {
    const list2 = await axios.post(`${ALIST_BASE_URL}/api/fs/list`, {
      path: '/',
      password: '',
      page: 1,
      per_page: 30,
      refresh: false
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('Bearer format works:', list2.data.code === 200);
  } catch (e) {
    console.log('Bearer format failed');
  }
}

test().catch(console.error);
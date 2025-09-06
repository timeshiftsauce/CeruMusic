const axios = require('axios');

// Alist API 配置
const ALIST_BASE_URL = 'http://47.96.72.224:5244';
const ALIST_USERNAME = 'ceruupdate';
const ALIST_PASSWORD = '123456';

async function testAlistConnection() {
  console.log('Testing Alist connection...');
  
  try {
    // 0. 首先测试服务器是否可访问
    console.log('0. Testing server accessibility...');
    const pingResponse = await axios.get(`${ALIST_BASE_URL}/ping`, {
      timeout: 5000
    });
    console.log('Server ping successful:', pingResponse.status);

    // 1. 测试认证
    console.log('1. Testing authentication...');
    console.log(`Trying to authenticate with username: ${ALIST_USERNAME}`);
    
    const authResponse = await axios.post(`${ALIST_BASE_URL}/api/auth/login`, {
      username: ALIST_USERNAME,
      password: ALIST_PASSWORD
    }, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('Auth response:', authResponse.data);

    if (authResponse.data.code !== 200) {
      // 尝试获取公共访问权限
      console.log('Authentication failed, trying public access...');
      
      // 尝试不使用认证直接访问文件列表
      const publicListResponse = await axios.post(`${ALIST_BASE_URL}/api/fs/list`, {
        path: '/',
        password: '',
        page: 1,
        per_page: 30,
        refresh: false
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Public access response:', publicListResponse.data);
      
      if (publicListResponse.data.code === 200) {
        console.log('✓ Public access successful');
        return; // 如果公共访问成功，就不需要认证
      }
      
      throw new Error(`Authentication failed: ${authResponse.data.message}`);
    }

    const token = authResponse.data.data.token;
    console.log('✓ Authentication successful');

    // 2. 测试文件列表
    console.log('2. Testing file listing...');
    const listResponse = await axios.post(`${ALIST_BASE_URL}/api/fs/list`, {
      path: '/',
      password: '',
      page: 1,
      per_page: 30,
      refresh: false
    }, {
      timeout: 10000,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('List response:', listResponse.data);
    
    if (listResponse.data.code === 200) {
      console.log('✓ File listing successful');
      console.log('Available directories/files:');
      listResponse.data.data.content.forEach(item => {
        console.log(`  - ${item.name} (${item.is_dir ? 'directory' : 'file'})`);
      });
    }

    // 3. 测试获取特定文件信息（如果存在版本目录）
    console.log('3. Testing file info retrieval...');
    try {
      const fileInfoResponse = await axios.post(`${ALIST_BASE_URL}/api/fs/get`, {
        path: '/v1.0.0'  // 测试版本目录
      }, {
        timeout: 10000,
        headers: {
          'Authorization': token,
          'Content-Type': 'application/json'
        }
      });

      console.log('File info response:', fileInfoResponse.data);
      
      if (fileInfoResponse.data.code === 200) {
        console.log('✓ File info retrieval successful');
      }
    } catch (error) {
      console.log('ℹ Version directory /v1.0.0 not found (this is expected if no updates are available)');
    }

    console.log('\n✅ Alist connection test completed successfully!');
    
  } catch (error) {
    console.error('❌ Alist connection test failed:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    } else if (error.request) {
      console.error('No response received. Check if the Alist server is running and accessible.');
    }
    
    process.exit(1);
  }
}

// 运行测试
testAlistConnection();
import {chromium} from 'playwright'
const browser=await chromium.connectOverCDP('http://127.0.0.1:9222')
const cdp=await browser.newBrowserCDPSession()
try {await cdp.send('Browser.close')} catch(error) {
  if(!/closed/i.test(error.message))throw error
}

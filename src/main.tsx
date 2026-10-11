import React from 'react';
import ReactDOM from 'react-dom/client';
import { App as AntdApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import App from './App';
import 'antd/dist/reset.css';
import './styles.css';

dayjs.locale('zh-cn');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={{ token: {
      colorPrimary: '#1677ff', colorBgLayout: '#f5f7fa', borderRadius: 8,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    }, components: { Layout: { headerBg: '#ffffff', siderBg: '#ffffff' }, Menu: { itemBorderRadius: 6 } } }}>
      <AntdApp><App /></AntdApp>
    </ConfigProvider>
  </React.StrictMode>,
);

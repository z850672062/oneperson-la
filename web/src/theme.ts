import type { ThemeConfig } from 'antd'

export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: '#22303c',
    colorInfo: '#41719c',
    colorSuccess: '#3f7d5c',
    colorWarning: '#b9862e',
    colorError: '#b0433a',
    colorBgLayout: '#f0ece4',
    colorBgContainer: '#ffffff',
    colorText: '#2c2b27',
    colorTextSecondary: '#8b8577',
    colorBorder: '#e4dfd5',
    colorBorderSecondary: '#e4dfd5',
    borderRadius: 6,
    borderRadiusLG: 8,
    fontSize: 14,
    fontFamily:
      '"Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,-apple-system,sans-serif',
  },
  components: {
    Layout: {
      bodyBg: '#f0ece4',
      headerBg: '#ffffff',
    },
    Button: {
      primaryShadow: 'none',
      defaultShadow: 'none',
      defaultBorderColor: '#d5cfc2',
      fontWeight: 500,
    },
    Table: {
      headerBg: '#ffffff',
      headerColor: '#8b8577',
      headerSplitColor: 'transparent',
      rowHoverBg: '#faf8f4',
      borderColor: '#e4dfd5',
      cellPaddingBlock: 11,
      cellPaddingInline: 14,
    },
    Modal: {
      titleFontSize: 16,
    },
    Input: {
      activeBorderColor: '#37495a',
      hoverBorderColor: '#8b8577',
    },
    Select: {
      optionSelectedBg: '#eef1f4',
    },
    Switch: {
      colorPrimary: '#3f7d5c',
    },
    Tag: {
      borderRadiusSM: 3,
    },
  },
}

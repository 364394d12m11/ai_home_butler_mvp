# 微信小程序（AI 家庭管家）

## 目录结构概览
- `pages/`：各业务页面及其逻辑、样式文件。
- `components/`：可复用的自定义组件。
- `utils/`：工具方法（如天气图标、日出日落计算等）。
- `config/`：项目运行所需的配置（例如 `config/index.js`）。
- `assets/`：静态资源，如图标和图片。
- `cloudfunctions/`（如需）：微信云开发函数目录，需在本地新建并与云端同步。
- `app.js`、`app.json`、`app.wxss`：小程序入口、全局配置与样式文件。

## 本地运行步骤
1. 安装并打开[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。
2. 通过“导入项目”选择本仓库根目录，填写或选择对应的 AppID。
3. 如果项目使用云函数：
   - 在微信开发者工具中启用云开发，创建或选择环境。
   - 在本地 `cloudfunctions/` 下创建与仓库中同名的函数目录，将代码复制后通过“上传并部署”同步至云端。
4. 编译并在开发者工具中预览或真机调试。

## 环境变量与配置
- **envId**：在 `config/index.js` 中配置，用于指定云开发环境标识。如需切换环境，将 `envId` 更新为新的云开发环境 ID，并保持与微信开发者工具中选择的一致。
- **QWEATHER_KEY**：若集成和风天气服务，可通过以下方式配置：
  - 云函数方案：在需要访问天气接口的云函数中，通过环境变量或配置文件安全地注入 `QWEATHER_KEY`。
  - 小程序端方案：在 `config/index.js` 或新增的安全配置文件中设置 `QWEATHER_KEY`，并确保不在公共仓库泄露真实密钥（可使用占位符并在部署时替换）。

在部署或本地调试前，请确认上述配置已正确填写，并避免提交真实敏感信息到版本控制。


// ==========================================
// V5.3 WriterContext 接口定义
// 作用：统一上下文，确保文案层只读、不决策
// ==========================================

/**
 * 统一上下文（只读）
 * writer 只能基于这个上下文生成文案，不得修改任何推荐结果
 */
interface WriterContext {
  // 用户画像
  user: {
    tone: '温柔' | '简练' | '幽默';        // 由系统画像决定，前台不暴露
    family: {
      adults: number;
      kids: number;
      elders: number;
    };
    healthGoals: string[];                  // ['减脂', '增肌', '抗炎', '控糖', '素食']
    allergies: string[];                    // 过敏源
  };

  // 菜单信息（已由 menu-engine 决策完毕）
  menu: {
    dishes: Dish[];                         // 已选中的菜品
    summary: {
      calories: number;
      protein: number;
      vegPortion: number;
    };
    mode: '日常' | '目标' | '灵感';
    budget: '实惠' | '小资' | '精致';
  };

  // 区域画像（决定菜系倾向）
  regionProfile: {
    native: 'north' | 'south' | 'dongbei' | 'jiangzhehu' | 'chuanyu';  // 手机归属地
    current: string;                        // 当前定位城市
    mix: {
      native: number;                       // 归属地权重 (初始60%, 学习后可变)
      current: number;                      // 当前地权重 (初始40%, 学习后可变)
    };
    cityTier: 'T1' | 'nonT1';               // 城市级别
  };

  // 系统约束（由算法决定，文案只能描述不能改）
  constraints: {
    trendyQuota: number;                    // 洋气菜上限（预算×模式决定）
    trendyCurrent: number;                  // 当前洋气菜数量
    homelyMinRatio: number;                 // 家常保底比例
    exploreEnabled: boolean;                // 是否开启探索模式
    exploreCooldownActive: boolean;         // 探索冷却中（7天内）
  };

  // 隐式学习信号（行为数据）
  signals: {
    dwellMsByCluster: Record<string, number>;  // 停留时长（毫秒）按兴趣簇
    recentDuplicates: string[];                // 近期做过的菜（用于避免重复）
    nutritionFlags: ('calories_high' | 'calories_low' | 'protein_low' | 'veg_low')[];  // 营养异常标记
  };

  // 环境上下文
  env: {
    weather: {
      temp: number;
      rain: boolean;
      snow: boolean;
      typhoon: boolean;
      wind: 'calm' | 'breeze' | 'strong' | 'typhoon';
    };
    solarTerm: '立春' | '立夏' | '立秋' | '立冬' | '冬至' | null;
    date: string;                             // YYYY-MM-DD
    hasKids: boolean;                         // 快捷标记（从 user.family 计算）
  };
}

/**
 * 菜品对象
 */
interface Dish {
  id: string;
  name: string;
  course: '主菜' | '配菜' | '汤品' | '主食';
  tags: string[];                             // ['家常', '清淡', '高蛋白', '洋气']
  ingredients: { name: string; qty: string }[];
  time: number;                               // 制作时间（分钟）
  calories?: number;                          // 预估热量
  protein?: number;                           // 预估蛋白质
}

/**
 * 导出 API（全部纯函数、无副作用）
 */

/**
 * 生成营养点评
 * @param ctx - 只读上下文
 * @returns 点评文案
 */
export function generateNutritionComment(ctx: WriterContext): string;

/**
 * 生成单道菜的推荐理由
 * @param ctx - 只读上下文
 * @param dish - 已选中的菜品
 * @returns 推荐理由（基于已有决策生成解释）
 */
export function generateDishReason(ctx: WriterContext, dish: Dish): string;

/**
 * 生成"建议换一换"提示语
 * @param ctx - 只读上下文
 * @param reason - 换菜原因（由算法判断）
 * @returns 提示文案
 */
export function generateSwapHint(
  ctx: WriterContext,
  reason: 'recent_duplicate' | 'nutrition_imbalance' | 'budget_exceeded' | 'explore_cooldown' | 'default'
): string;

/**
 * 生成购物清单提示
 * @param ctx - 只读上下文
 * @param missingCount - 缺少的食材数量
 * @returns 提示文案
 */
export function generateShoppingPrompt(ctx: WriterContext, missingCount: number): string;

/**
 * 生成餐后反馈引导
 * @param ctx - 只读上下文
 * @returns 引导文案
 */
export function generateFeedbackPrompt(ctx: WriterContext): string;

/**
 * 生成视频脚本（兜底版）
 * @param ctx - 只读上下文
 * @param dish - 菜品对象
 * @returns 脚本结构
 */
export function generateVideoScriptFallback(
  ctx: WriterContext,
  dish: Dish
): {
  steps: { text: string; voice: string }[];
};

/**
 * 硬约束：
 * 1. 这些函数只能读 ctx，不得改动菜单、配额、探索开关
 * 2. 需要"建议换菜"的场景，只输出提示语，不直接替换
 * 3. 所有文案必须基于 ctx 生成，不得自造数据
 */
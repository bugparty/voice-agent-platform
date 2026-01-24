# 解决 AcquisitionFailedError (31402)

## 错误信息

```
AcquisitionFailedError (31402): The browser and end-user allowed permissions, 
however getting the media failed. Usually this is due to bad constraints, 
but can sometimes fail due to browser, OS or hardware issues.
```

## 问题原因

这个错误表示：
- ✅ 用户已经允许了麦克风权限
- ❌ 但是获取媒体流失败了

### 常见原因

1. **麦克风被其他应用占用**
   - 其他标签页正在使用麦克风
   - 其他应用（Zoom、Teams、Skype）占用了麦克风

2. **浏览器限制**
   - 同一时间只能有一个 getUserMedia 流
   - 我们的代码先请求了一次（检查权限），然后 Twilio SDK 又请求了一次

3. **硬件问题**
   - 麦克风驱动问题
   - USB 麦克风连接不稳定

4. **操作系统限制**
   - macOS/Windows 系统级麦克风权限未开启
   - 安全软件阻止了麦克风访问

---

## 解决方案

### 方案 1: 简化权限检查流程（推荐）

我们已经修改了代码：
- 权限检查后**立即停止 track**
- 让 Twilio SDK 自己请求麦克风
- 避免同时有两个 getUserMedia 请求

**代码改动：**
```typescript
// 检查权限
const stream = await getUserMedia({ audio: true });
// 立即停止 - 不占用麦克风
stream.getTracks().forEach(track => track.stop());
// Twilio SDK 稍后会重新请求
```

### 方案 2: 关闭其他占用麦克风的应用

**检查方法：**

#### Chrome
1. 打开 `chrome://media-internals/`
2. 查看 "Audio Capture" 部分
3. 找到正在使用麦克风的标签页/应用

#### macOS
1. 打开"活动监视器"
2. 搜索 "coreaudio" 或 "audio"
3. 查看哪些进程在使用音频设备

#### Windows
1. 任务管理器 → 性能 → 打开资源监视器
2. CPU 标签 → 搜索 "audio"

**解决：**
- 关闭其他使用麦克风的标签页
- 退出 Zoom、Teams、Skype 等应用
- 重新尝试 Join Conference

### 方案 3: 刷新页面重试

有时浏览器的媒体流状态会卡住：

1. 刷新页面（F5）
2. 重新点击 Call
3. 重新点击 Join Conference

### 方案 4: 使用仅收听模式

如果麦克风一直有问题，可以使用仅收听模式：

1. 在浏览器中**拒绝**麦克风权限
2. 点击 Join Conference
3. 系统会自动切换到仅收听模式（只能听，不能说）

---

## 调试步骤

### 1. 检查浏览器 Console

查看完整的错误堆栈：

```javascript
[Twilio Call] Initiating connection...
[Twilio Call] ✗ Connection failed: AcquisitionFailedError (31402)
```

### 2. 测试麦克风是否可用

在 Console 中运行：

```javascript
// 测试 1: 简单测试
navigator.mediaDevices.getUserMedia({ audio: true })
  .then(stream => {
    console.log('✓ 麦克风可用', stream);
    stream.getTracks().forEach(t => t.stop());
  })
  .catch(err => console.error('✗ 麦克风不可用', err));

// 测试 2: 连续两次请求（模拟我们的场景）
async function testDouble() {
  try {
    // 第一次请求
    const stream1 = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log('✓ 第一次成功', stream1);
    stream1.getTracks().forEach(t => t.stop());
    
    // 等待一下
    await new Promise(r => setTimeout(r, 100));
    
    // 第二次请求
    const stream2 = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log('✓ 第二次成功', stream2);
    stream2.getTracks().forEach(t => t.stop());
  } catch (err) {
    console.error('✗ 失败', err);
  }
}
testDouble();
```

### 3. 检查系统权限

#### macOS
```bash
# 查看哪些应用有麦克风权限
sqlite3 ~/Library/Application\ Support/com.apple.TCC/TCC.db \
  "SELECT client FROM access WHERE service='kTCCServiceMicrophone';"
```

#### Windows
设置 → 隐私 → 麦克风 → 查看哪些应用可以访问

---

## 代码改进

### 改进前（有问题）

```typescript
// Step 2: 请求权限
const stream = await getUserMedia({ audio: true });
// ❌ 没有停止 track，麦克风被占用

// Step 5: Twilio SDK 连接
await device.connect({ params: { sessionId }});
// ❌ 失败！因为麦克风已经被占用
```

### 改进后（正确）

```typescript
// Step 2: 检查权限
const stream = await getUserMedia({ audio: true });
stream.getTracks().forEach(track => track.stop());  // ✅ 立即释放

// Step 5: Twilio SDK 连接
await device.connect({ params: { sessionId }});
// ✅ 成功！Twilio SDK 可以获取麦克风
```

---

## 浏览器兼容性

| 浏览器 | 支持情况 | 注意事项 |
|--------|---------|---------|
| Chrome 90+ | ✅ 完全支持 | 推荐使用 |
| Firefox 88+ | ✅ 完全支持 | - |
| Safari 14+ | ⚠️ 部分支持 | 可能需要用户手动允许多次 |
| Edge 90+ | ✅ 完全支持 | 基于 Chromium |

---

## 最佳实践

### 1. 延迟请求麦克风

```typescript
// ❌ 不好：立即请求
const stream = await getUserMedia({ audio: true });
await initTwilioDevice();

// ✅ 好：让 Twilio SDK 自己请求
await initTwilioDevice();
// Twilio SDK 会在需要时请求麦克风
```

### 2. 正确释放资源

```typescript
// ✅ 总是停止不再使用的 tracks
stream.getTracks().forEach(track => {
  console.log('Stopping track:', track.label);
  track.stop();
});
```

### 3. 提供降级方案

```typescript
try {
  await joinConference();
} catch (err) {
  if (err.code === 31402) {
    // 提示用户切换到仅收听模式
    console.warn('Falling back to listen-only mode');
  }
}
```

---

## 相关错误代码

| 错误代码 | 含义 | 解决方法 |
|---------|------|---------|
| 31402 | AcquisitionFailedError | 释放麦克风，重试 |
| 31208 | NotAllowedError | 用户拒绝权限 |
| 31201 | NotFoundError | 找不到麦克风设备 |
| 31204 | NotReadableError | 麦克风被占用 |

---

## 总结

✅ **已修复**：权限检查后立即释放麦克风  
✅ **已改进**：让 Twilio SDK 自己管理媒体流  
✅ **已支持**：仅收听模式作为降级方案  

如果问题仍然存在，请：
1. 刷新页面重试
2. 关闭其他使用麦克风的应用
3. 检查系统麦克风权限
4. 使用仅收听模式

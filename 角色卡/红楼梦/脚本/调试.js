// ================================================================================
// 世界书读取测试脚本
// 用于诊断为什么无法读取事件条目
// ================================================================================

(async function() {
    const EVENT_KEY_PREFIX = "红楼事件条目-";
    
    console.log("%c========== 世界书读取测试 ==========", "color: #00aaff; font-size: 16px; font-weight: bold;");
    
    try {
        // 1. 获取角色的世界书
        const charWorldbooks = await getCharWorldbookNames('current');
        console.log("📚 角色世界书信息:");
        console.log("  - Primary:", charWorldbooks.primary);
        console.log("  - Additional:", charWorldbooks.additional);
        
        const worldbookNamesToScan = [
            ...(charWorldbooks.primary ? [charWorldbooks.primary] : []),
            ...charWorldbooks.additional
        ];
        
        if (worldbookNamesToScan.length === 0) {
            console.error("❌ 未找到任何世界书！");
            toastr.error("未找到世界书");
            return;
        }
        
        console.log("\n📖 将扫描的世界书:", worldbookNamesToScan);
        
        // 2. 逐个加载世界书内容
        for (const worldbookName of worldbookNamesToScan) {
            console.log(`\n--- 扫描世界书: ${worldbookName} ---`);
            
            try {
                const entries = await getWorldbook(worldbookName);
                
                if (!entries || entries.length === 0) {
                    console.warn(`⚠️ 世界书 ${worldbookName} 为空或无法读取`);
                    continue;
                }
                
                console.log(`✓ 世界书 ${worldbookName} 包含 ${entries.length} 个条目`);
                
                // 3. 列出所有条目
                console.group("📋 所有条目列表:");
                entries.forEach((entry, index) => {
                    console.log(`${index + 1}. "${entry.name}" (启用: ${entry.enabled !== false})`);
                });
                console.groupEnd();
                
                // 4. 查找事件条目
                console.group("🔍 查找事件条目:");
                const eventEntries = entries.filter(entry => 
                    entry.name && entry.name.startsWith(EVENT_KEY_PREFIX)
                );
                
                if (eventEntries.length === 0) {
                    console.warn(`⚠️ 在世界书 ${worldbookName} 中未找到任何以 "${EVENT_KEY_PREFIX}" 开头的条目`);
                } else {
                    console.log(`✅ 找到 ${eventEntries.length} 个事件条目:`);
                    
                    eventEntries.forEach((entry, index) => {
                        console.log(`\n事件 ${index + 1}: "${entry.name}"`);
                        console.log("  - 启用:", entry.enabled !== false);
                        console.log("  - 内容长度:", entry.content?.length || 0, "字符");
                        
                        // 尝试解析JSON
                        if (entry.content) {
                            try {
                                const eventData = JSON.parse(entry.content);
                                console.log("  ✓ JSON解析成功");
                                console.log("  - 事件地点:", eventData.事件地点);
                                console.log("  - 触发时间:", `${eventData.触发条件?.年}年${eventData.触发条件?.月}月${eventData.触发条件?.日}日`);
                                console.log("  - 结束时间:", `${eventData.事件结束时间?.年}年${eventData.事件结束时间?.月}月${eventData.事件结束时间?.日}日`);
                                console.groupCollapsed("  - 完整数据:");
                                console.log(eventData);
                                console.groupEnd();
                            } catch (e) {
                                console.error("  ❌ JSON解析失败:", e.message);
                                console.log("  - 内容预览:", entry.content.substring(0, 200));
                            }
                        } else {
                            console.warn("  ⚠️ 条目内容为空");
                        }
                    });
                }
                console.groupEnd();
                
            } catch (e) {
                console.error(`❌ 无法加载世界书 ${worldbookName}:`, e);
            }
        }
        
        console.log("\n%c========== 测试完成 ==========", "color: #00ff00; font-size: 16px; font-weight: bold;");
        toastr.success("世界书读取测试完成，请查看控制台（F12）");
        
    } catch (error) {
        console.error("❌ 测试过程出错:", error);
        toastr.error("测试失败");
    }
})();

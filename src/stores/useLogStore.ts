import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface LogEntry {
  id: number
  timestamp: string
  type: 'info' | 'warning' | 'error' | 'success'
  message: string
  sessionId: string
}

export const useLogStore = defineStore('log', () => {
  const logs = ref<LogEntry[]>([])
  const currentSessionId = ref<string>('')
  const currentSessionName = ref<string>('Mặc định')
  let logIdCounter = 0

  function startNewSession(name = 'Phân tích AI') {
    currentSessionId.value = `session_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
    currentSessionName.value = name
    addLog(`=== BẮT ĐẦU PHIÊN: ${name.toUpperCase()} ===`, 'info')
  }

  function addLog(message: string, type: LogEntry['type'] = 'info') {
    if (!currentSessionId.value) {
      currentSessionId.value = `session_${Date.now()}`
    }
    
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    const ss = String(now.getSeconds()).padStart(2, '0')
    const ms = String(now.getMilliseconds()).padStart(3, '0')
    const timestamp = `${hh}:${mm}:${ss}.${ms}`

    logs.value.push({
      id: ++logIdCounter,
      timestamp,
      type,
      message,
      sessionId: currentSessionId.value
    })

    // Limit log size to prevent memory leaks (keep last 500 logs)
    if (logs.value.length > 500) {
      logs.value.shift()
    }
  }

  function clearLogs() {
    logs.value = []
    currentSessionId.value = ''
    currentSessionName.value = 'Mặc định'
  }

  // Computed properties
  const latestSessionLogs = computed(() => {
    if (!currentSessionId.value) return []
    return logs.value.filter(log => log.sessionId === currentSessionId.value)
  })

  const latestSessionLogsText = computed(() => {
    return latestSessionLogs.value
      .map(log => `[${log.timestamp}] [${log.type.toUpperCase()}] ${log.message}`)
      .join('\n')
  })

  return {
    logs,
    currentSessionId,
    currentSessionName,
    startNewSession,
    addLog,
    clearLogs,
    latestSessionLogs,
    latestSessionLogsText
  }
})

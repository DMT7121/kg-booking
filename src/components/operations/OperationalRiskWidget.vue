<template>
  <div class="rounded-2xl border border-slate-800 bg-slate-900/90 backdrop-blur-md p-4 shadow-xl">
    <!-- Header -->
    <div class="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-800">
      <div class="flex items-center gap-2">
        <span class="p-1.5 rounded-lg bg-rose-500/20 text-rose-400 text-sm">🚨</span>
        <h3 class="text-sm font-extrabold text-white uppercase tracking-wider">
          Trung Tâm Cảnh Báo Rủi Ro
        </h3>
      </div>
      <span 
        class="px-2 py-0.5 rounded-full text-xs font-black"
        :class="totalRisks > 0 ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'"
      >
        {{ totalRisks > 0 ? `${totalRisks} vấn đề` : 'An toàn' }}
      </span>
    </div>

    <!-- Empty State -->
    <div v-if="totalRisks === 0" class="py-6 text-center text-xs text-slate-400">
      <span class="text-2xl mb-1 block">✨</span>
      Tất cả các booking hôm nay đều đạt tiêu chuẩn vận hành an toàn.
    </div>

    <!-- Issues List -->
    <div v-else class="space-y-2 max-h-[320px] overflow-y-auto pr-1">
      <div 
        v-for="(issue, idx) in sortedIssues" 
        :key="idx"
        class="p-2.5 rounded-xl border text-xs transition flex flex-col justify-between gap-1"
        :class="getIssueCardClass(issue.severity)"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-1.5 font-bold">
            <span class="text-sm">{{ getSeverityIcon(issue.severity) }}</span>
            <span>{{ issue.title }}</span>
          </div>
          <span 
            class="px-1.5 py-0.5 rounded text-[10px] font-black uppercase border"
            :class="getSeverityBadgeClass(issue.severity)"
          >
            {{ issue.severity }}
          </span>
        </div>

        <p class="text-slate-300 text-[11px] leading-relaxed">
          {{ issue.message }}
        </p>

        <div v-if="issue.suggestedResolution" class="pt-1 text-[11px] text-amber-400/90 flex items-center gap-1">
          <span class="font-bold">👉 Gợi ý:</span> {{ issue.suggestedResolution }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { OperationalRiskIssue, RiskSeverity } from '@/domain/booking/conflictEngine'

const props = defineProps<{
  issues: OperationalRiskIssue[]
}>()

const totalRisks = computed(() => props.issues?.length || 0)

const severityRank: Record<RiskSeverity, number> = {
  CRITICAL: 4,
  HIGH: 3,
  WARNING: 2,
  INFO: 1
}

const sortedIssues = computed(() => {
  if (!props.issues) return []
  return [...props.issues].sort((a, b) => severityRank[b.severity] - severityRank[a.severity])
})

function getSeverityIcon(severity: RiskSeverity): string {
  switch (severity) {
    case 'CRITICAL': return '🛑'
    case 'HIGH': return '⚠️'
    case 'WARNING': return '⚡'
    case 'INFO': return 'ℹ️'
  }
}

function getIssueCardClass(severity: RiskSeverity): string {
  switch (severity) {
    case 'CRITICAL': return 'bg-rose-950/30 border-rose-500/40 text-rose-200'
    case 'HIGH': return 'bg-amber-950/30 border-amber-500/40 text-amber-200'
    case 'WARNING': return 'bg-yellow-950/20 border-yellow-500/30 text-yellow-200'
    case 'INFO': return 'bg-slate-800/80 border-slate-700 text-slate-200'
  }
}

function getSeverityBadgeClass(severity: RiskSeverity): string {
  switch (severity) {
    case 'CRITICAL': return 'bg-rose-500/30 text-rose-200 border-rose-500/50'
    case 'HIGH': return 'bg-amber-500/30 text-amber-200 border-amber-500/50'
    case 'WARNING': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
    case 'INFO': return 'bg-slate-700 text-slate-300 border-slate-600'
  }
}
</script>

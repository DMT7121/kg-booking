<template>
  <div class="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
    <!-- Header -->
    <div class="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-slate-100 dark:border-slate-800">
      <div class="flex items-center gap-2">
        <span class="p-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 text-sm border border-rose-100 dark:border-rose-800/40">🚨</span>
        <h3 class="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">
          Cảnh Báo Rủi Ro Ca Trực
        </h3>
      </div>
      <span 
        class="px-2.5 py-0.5 rounded-full text-[11px] font-black font-tabular"
        :class="totalRisks > 0 ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60' : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'"
      >
        {{ totalRisks > 0 ? `${totalRisks} cảnh báo` : '✓ An toàn' }}
      </span>
    </div>

    <!-- Empty State -->
    <div v-if="totalRisks === 0" class="py-6 text-center text-xs text-slate-400 dark:text-slate-500">
      <span class="text-2xl mb-1.5 block">✨</span>
      Tất cả các booking trong ca đều đạt tiêu chuẩn vận hành an toàn.
    </div>

    <!-- Issues List -->
    <div v-else class="space-y-2 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
      <div 
        v-for="(issue, idx) in sortedIssues" 
        :key="idx"
        class="p-3 rounded-2xl border text-xs transition flex flex-col justify-between gap-1.5"
        :class="getIssueCardClass(issue.severity)"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-1.5 font-black">
            <span class="text-sm shrink-0">{{ getSeverityIcon(issue.severity) }}</span>
            <span class="leading-tight">{{ issue.title }}</span>
          </div>
          <span 
            class="px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border shrink-0"
            :class="getSeverityBadgeClass(issue.severity)"
          >
            {{ issue.severity }}
          </span>
        </div>

        <p class="text-[11.5px] leading-relaxed opacity-90 font-medium">
          {{ issue.message }}
        </p>

        <div v-if="issue.suggestedResolution" class="pt-1.5 border-t border-black/5 dark:border-white/5 text-[11px] font-semibold flex items-center gap-1">
          <span class="font-black opacity-80">👉 Gợi ý:</span>
          <span>{{ issue.suggestedResolution }}</span>
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
    case 'CRITICAL': return 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200'
    case 'HIGH': return 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200'
    case 'WARNING': return 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800/50 text-yellow-800 dark:text-yellow-200'
    case 'INFO': return 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
  }
}

function getSeverityBadgeClass(severity: RiskSeverity): string {
  switch (severity) {
    case 'CRITICAL': return 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 border-rose-300/50 dark:border-rose-700/50'
    case 'HIGH': return 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 border-amber-300/50 dark:border-amber-700/50'
    case 'WARNING': return 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300 border-yellow-300/50 dark:border-yellow-700/50'
    case 'INFO': return 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600'
  }
}
</script>

import { preNormalizeInput, extractByRules, classifyPeopleNames, cleanHonorificPrefix } from '../src/domain/ai/ruleEngine'

const inputs = [
  'Anh Sơn 0901234567 đặt bàn 5 người tối nay 7h',
  'Chị Hạnh đặt bàn 6 người lúc 19h, SĐT 0987654321',
  'Tên em là Oanh, đặt bàn 4 người tối mai',
  'Liên hệ anh Phúc 0987654321',
  'Sơn lại bàn này giúp em',
  'Mai đặt được không?',
  'Hạnh phúc quá',
  'Vui lòng đặt bàn 5 người',
  'Cho em hỏi tối mai còn bàn không?',
  'Sơn 0901234567 đặt bàn 5 người tối nay',
  'Oanh 0987654321 bàn 4 người 7h',
  'Anh Sơn đặt bàn cho chị Hạnh 5 người tối nay, liên hệ 0901234567'
]

inputs.forEach(input => {
  const normalized = preNormalizeInput(input)
  console.log(`Input: "${input}"`)
  console.log(`Normalized: "${normalized}"`)
  
  const nameRegex = /(?:anh|chị|em|chú|cô|ông|bà|anh|chi|em|chu|co|ong|ba|bé|be|khách|khach|tên|ten|đặt|dat|cho|liên hệ|lien he)\s+(\p{L}+(?:\s+(?!cho\b|dat\b|đặt\b|dat\s+ban|đặt\s+bàn|xin\b|gui\b|gửi\b|nha\b|nhà\b|ngay\b|ngày\b|luc\b|lúc\b|vao\b|vào\b|sdt\b|sđt\b|ban\b|bàn\b)\p{L}+){0,3})/gu
  let match
  while ((match = nameRegex.exec(normalized)) !== null) {
    console.log(`  Match found: prefix="${match[0].substring(0, match[0].indexOf(match[1]))}", captured="${match[1]}"`)
    let cleaned = cleanHonorificPrefix(match[1])
    console.log(`  Cleaned captured: "${cleaned}"`)
  }
  
  const result = extractByRules(normalized)
  const nameResults = classifyPeopleNames(normalized)
  console.log(`  Result: name="${result.customer_name}", confidence=${result.customer_name_confidence}`)
  console.log('-----------------------------------')
})

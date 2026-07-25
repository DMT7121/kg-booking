const GAS_URL = 'https://script.google.com/macros/s/AKfycbxzjio4sat5fWoUncPgp8SfjoGqfGxW5vFoDgkHvBI3OKVWIaszsAaUt0LE2fCHtkCFsA/exec'

async function checkMenuData() {
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'getMenu', sheetName: 'MENU2026' })
  })
  const data = await res.json()
  console.log('MENU2026 item count:', data.data ? data.data.length : 0)
  console.log('First 5 items:', data.data ? data.data.slice(0, 5) : [])
}

checkMenuData()

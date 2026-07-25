const GAS_URL = 'https://script.google.com/macros/s/AKfycbxzjio4sat5fWoUncPgp8SfjoGqfGxW5vFoDgkHvBI3OKVWIaszsAaUt0LE2fCHtkCFsA/exec'

async function testGas() {
  console.log('Testing GAS getMenu for MENU2026...')
  try {
    const resMenu = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'getMenu', sheetName: 'MENU2026' })
    })
    const menuData = await resMenu.json()
    console.log(`getMenu result for "MENU2026": ok=${menuData.ok}, count=${menuData.data ? menuData.data.length : 0}`)
    if (menuData.data && menuData.data.length > 0) {
      console.log('Sample item 0:', menuData.data[0])
      console.log('Sample item 1:', menuData.data[1])
      console.log('Sample item 2:', menuData.data[2])
    }
  } catch (err) {
    console.error('GAS fetch error:', err)
  }
}

testGas()

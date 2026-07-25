const GAS_URL = 'https://script.google.com/macros/s/AKfycbxzjio4sat5fWoUncPgp8SfjoGqfGxW5vFoDgkHvBI3OKVWIaszsAaUt0LE2fCHtkCFsA/exec'

async function checkHistoryData() {
  console.log('Fetching getHistory from GAS...')
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'getHistory' })
    })
    const data = await res.json()
    console.log('getHistory result: ok=', data.ok, 'count=', data.data ? data.data.length : 0)
    if (data.data && data.data.length > 0) {
      console.log('Sample order 0:', data.data[0])
    } else {
      console.log('Raw data response:', JSON.stringify(data).slice(0, 500))
    }
  } catch (err) {
    console.error('getHistory fetch error:', err)
  }
}

checkHistoryData()

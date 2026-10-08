/**
 * Demo inputs. Every string here is FABRICATED for demonstration and is
 * labelled as a test input wherever it appears. The results shown for them
 * are never stored here: each one is sent to the live model, so what you see
 * is the model's actual output, including any mistakes it makes.
 *
 * SecureNet never opens or fetches a scanned link, so the example domains are
 * only ever read as strings. The IP address is from the 198.51.100.0/24
 * documentation range.
 */
export const DEMO = [
  {
    id: 'phish', kind: 'url', title: 'Phishing links', intended: 'phishing',
    items: [
      'http://198.51.100.23:8080/upi/verify.php',
      'http://sbi-kyc-verify.tk/netbanking/login.php',
      'https://hdfcbank.secure-update.xyz/account/confirm?token=a81f2c',
      'http://paytm-cashback-reward.top/claim',
      'bit.ly/kyc-upd-now'
    ]
  },
  {
    id: 'safe', kind: 'url', title: 'Safe links', intended: 'safe',
    items: [
      'https://www.sbi.co.in/web/personal-banking',
      'https://www.hdfcbank.com/personal/borrow/popular-loans',
      'https://www.irctc.co.in/nget/train-search',
      'https://github.com/features/actions'
    ]
  },
  {
    id: 'upi', kind: 'sms', title: 'UPI scams', intended: 'scam',
    items: [
      'Dear user collect request of Rs 4,999 pending. Approve UPI PIN to receive money upi-reward.top',
      'You have received Rs 2,500 cashback from PhonePe. To credit it enter your UPI PIN on the request sent now.'
    ]
  },
  {
    id: 'kyc', kind: 'sms', title: 'KYC and banking scams', intended: 'scam',
    items: [
      'Dear customer your SBI account will be BLOCKED today. Complete KYC now bit.ly/kyc-upd',
      'VM-HDFCBK Your PAN is not linked. Netbanking will be suspended in 24 hours. Update KYC at hdfc-kyc-update.top/pan'
    ]
  },
  {
    id: 'job', kind: 'sms', title: 'Fake job offers', intended: 'scam',
    items: [
      'Hiring now! Part time work from home. Earn Rs 3000 per day by liking YouTube videos. Message HR on Telegram to start today.',
      'Congratulations, you are selected for a work from home data entry job. Salary Rs 25,000/month. Pay Rs 499 registration fee to confirm your seat.'
    ]
  },
  {
    id: 'legit', kind: 'sms', title: 'Genuine messages', intended: 'safe',
    items: [
      'OTP for your HDFC netbanking login is 448210. Valid 10 min. Do not share with anyone.',
      'Your order has been shipped and will be delivered by Friday. Track it in the app.'
    ]
  }
]

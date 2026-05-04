import { sendEmail } from '../server/utils/email.js'

;(async () => {
  try {
    const info = await sendEmail({ to: process.env.TEST_EMAIL || 'your-email@example.com', subject: 'PetSelf test email', text: 'This is a test email from PetSelf', html: '<p>This is a test email from PetSelf</p>' })
    console.log('sendEmail returned:', info)
  } catch (e) {
    console.error('sendEmail failed:', e)
  }
})()

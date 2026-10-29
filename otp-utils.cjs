function generateOtp(length = 6) {
  const digits = '0123456789';
  let otp = '';

  for (let index = 0; index < length; index += 1) {
    otp += digits[Math.floor(Math.random() * digits.length)];
  }

  return otp;
}

function isOtpExpired(expiresAt) {
  return Date.now() > expiresAt;
}

module.exports = {
  generateOtp,
  isOtpExpired
};

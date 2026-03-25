import React from 'react';

const QRCode = ({ value, size = 200 }) => {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=faf7f2&color=2c2c2c&margin=12`;
  return (
    <img
      src={url}
      alt="QR Code"
      width={size}
      height={size}
      style={{ borderRadius: 4, display: 'block' }}
    />
  );
};

export default QRCode;

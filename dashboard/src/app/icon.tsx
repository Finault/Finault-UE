import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const size = {
  width: 32,
  height: 32,
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 24,
          background: '#141619',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 6,
        }}
      >
        <svg
          width="20"
          height="24"
          viewBox="0 0 20 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M10 0L0 4.5V10.5C0 16.3 4.02 21.74 10 23.5C15.98 21.74 20 16.3 20 10.5V4.5L10 0ZM10 11.75H18C17.47 16.17 14.19 20.04 10 21.42V11.75H2V5.67L10 2.17V11.75Z"
            fill="#22c55e"
          />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}

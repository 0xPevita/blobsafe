export function BirdLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8 27.5c9.1-9.4 18.7-14 31.7-14.7-4.4 2.5-7.9 5.9-10.5 10.2 4.6.6 8.4 2.3 11.4 5.2-7.2-.7-13.4.8-18.6 4.7-4.9 3.6-10.6 4.5-17.1 2.6 4.8-1.9 8.2-4.5 10.1-7.7-2.8.2-5.1.1-7-.3Z"
        fill="currentColor"
      />
      <path
        d="M16.4 22.8c5.8-5.6 12.5-9 20.1-10.1-7.1 3.6-12.6 8.9-16.4 16"
        stroke="rgb(7 8 10)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M31.2 15.1c-2.2-3-5.1-5.1-8.8-6.4 1 4 .4 7.8-1.8 11.6"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.82"
      />
      <path
        d="M35.9 14.1 43 9.8l-3.3 7.6"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

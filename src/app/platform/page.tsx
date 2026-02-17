import { redirect } from 'next/navigation';

const PlatformIndexPage = () => {
  redirect('/platform/current');
};

export default PlatformIndexPage;

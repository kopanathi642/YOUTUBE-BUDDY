import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { HeroSection } from '@/components/home/HeroSection';
import { FeaturesSection } from '@/components/home/FeaturesSection';
import { PricingPreview } from '@/components/home/PricingPreview';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-bg-primary">
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <PricingPreview />
      <Footer />
    </main>
  );
}

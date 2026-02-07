"use client";

import React, { useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const TermsPage = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
              <p className="text-gray-600 mb-12">Last updated: March 7, 2025</p>

              <div className="prose prose-lg max-w-none">
                <h2>Agreement to Terms</h2>
                <p>
                  These Terms of Service constitute a legally binding agreement
                  made between you and AITrader, concerning your access to and
                  use of our website and services. By accessing our website and
                  using our services, you agree to be bound by these Terms of
                  Service.
                </p>

                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 my-6">
                  <div className="flex">
                    <div className="ml-3">
                      <h3 className="text-lg font-medium text-yellow-800">
                        Disclaimer: Not Financial Advice
                      </h3>
                      <div className="mt-2 text-yellow-700">
                        <p>
                          The information provided on our website and through
                          our services is for informational and educational
                          purposes only. It is not intended to be and does not
                          constitute financial advice, investment advice,
                          trading advice, or any other advice.
                        </p>
                        <p className="mt-2">
                          All content on this website and the services provided
                          herein is information of a general nature and does
                          not address the specific circumstances of any
                          particular individual or entity.
                        </p>
                        <p className="mt-2">
                          <strong>
                            You should consult with a financial professional
                            before making any investment decisions.
                          </strong>{" "}
                          The use of any information or recommendations from
                          AITrader is entirely at your own risk, and AITrader
                          will not be liable for any losses, damages, or other
                          outcomes resulting from the use of our information or
                          services.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <h2>User Representations</h2>
                <p>By using our services, you represent and warrant that:</p>
                <ol>
                  <li>You have the legal capacity to enter into these Terms of Service.</li>
                  <li>You are at least 18 years old.</li>
                  <li>You will not use our services for any illegal or unauthorized purpose.</li>
                  <li>Your use of our services will not violate any applicable law or regulation.</li>
                </ol>

                <h2>Intellectual Property Rights</h2>
                <p>
                  Unless otherwise indicated, our website and its contents are
                  the property of AITrader and are protected by copyright,
                  trademark, and other intellectual property laws. You are
                  granted a limited license to access and use our website and
                  its content for personal, non-commercial use.
                </p>

                <h2>User Account</h2>
                <p>
                  If you create an account with us, you are responsible for
                  maintaining the confidentiality of your account and password
                  and for restricting access to your account. You agree to
                  accept responsibility for all activities that occur under your
                  account.
                </p>

                <h2>Purchases and Payment</h2>
                <p>
                  We accept various forms of payment for our services. You agree
                  to provide current, complete, and accurate purchase and
                  account information for all purchases made via our website.
                  You further agree to promptly update account and payment
                  information, including email address, payment method, and
                  payment card expiration date, so that we can complete your
                  transactions and contact you as needed.
                </p>

                <h2>Subscription Services</h2>
                <p>
                  Your subscription to our services will continue until
                  terminated. To cancel your subscription, contact us at least
                  24 hours before the end of your current billing period to
                  avoid being charged for the next period.
                </p>

                <h2>Fee Changes</h2>
                <p>
                  We reserve the right to adjust pricing for our services at any
                  time. We will provide reasonable notice of any change in fees.
                </p>

                <h2>Risk Disclosure</h2>
                <p>
                  Investing in financial markets involves risk. The value of
                  your investments can go down as well as up, and you may get
                  back less than you invest. Past performance is not indicative
                  of future results. The AI-powered insights and recommendations
                  provided by our service are based on algorithmic analysis and
                  may not always be accurate or profitable.
                </p>

                <h2>Market Data</h2>
                <p>
                  The market data and information provided through our services
                  is obtained from sources believed to be reliable, but we
                  cannot guarantee its accuracy, completeness, or timeliness.
                  We are not responsible for any errors or omissions in this
                  information.
                </p>

                <h2>Limitation of Liability</h2>
                <p>
                  To the fullest extent permitted by applicable law, in no
                  event will AITrader, its affiliates, or its licensors be
                  liable for any indirect, consequential, exemplary, incidental,
                  special, or punitive damages, including lost profits, even if
                  AITrader has been advised of the possibility of such damages.
                </p>

                <h2>Indemnification</h2>
                <p>
                  You agree to defend, indemnify, and hold us harmless from and
                  against any claims, liabilities, damages, losses, and
                  expenses, arising out of or in any way connected with your
                  access to or use of our services, or your violation of these
                  Terms of Service.
                </p>

                <h2>Termination</h2>
                <p>
                  We reserve the right to terminate or suspend your account and
                  access to our services at our sole discretion, without notice,
                  for conduct that we believe violates these Terms of Service or
                  is harmful to other users of our services, us, or third
                  parties, or for any other reason.
                </p>

                <h2>Changes to Terms</h2>
                <p>
                  We reserve the right to update or modify these Terms of
                  Service at any time without prior notice. Your continued use
                  of our services following any changes indicates your
                  acceptance of the new terms.
                </p>

                <h2>Contact Information</h2>
                <p>
                  Questions about the Terms of Service should be sent to us at:{" "}
                  <a
                    href="mailto:tryaitrader@gmail.com"
                    className="text-trader-blue hover:underline"
                  >
                    tryaitrader@gmail.com
                  </a>
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default TermsPage;

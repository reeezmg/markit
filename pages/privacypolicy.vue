<template>
  <UPage>

    <!-- BODY -->
    <UContainer class="py-10 max-w-4xl">

      <!-- TITLE -->
      <div class="text-center mb-10">
        <h2 class="text-3xl font-bold">
          PRIVACY POLICY
        </h2>

        <p class="text-xl font-semibold mt-4">
          FLOBIT TECHNOLOGIES PRIVATE LIMITED
        </p>

        <p class="text-gray-600 mt-6">
          Effective Date – December 17, 2025
        </p>

        <p class="text-gray-600">
          Last Updated – December 17, 2025
        </p>
      </div>

      <!-- INTRODUCTION -->
      <UCard class="mb-6">
        <template #header>
          <h3 class="font-semibold text-lg">Introduction</h3>
        </template>

        <p>
          Thank you for choosing <strong>Markit</strong>, operated by
          <strong>Flobit Technologies Private Limited</strong>
          (“Flobit”, “we”, “us”, “our”).
        </p>

        <p class="mt-3">
          This Privacy Policy explains how we collect, use, store, and protect
          your personal information when you use our platform.
        </p>
      </UCard>

      <!-- SUMMARY -->
      <UCard class="mb-6">
        <template #header>
          <h3 class="font-semibold text-lg">Summary of Key Points</h3>
        </template>

        <ul class="list-disc ml-6 space-y-1">
          <li>We collect personal data required to provide services.</li>
          <li>We do not process sensitive personal data.</li>
          <li>Payments are processed securely by Razorpay.</li>
          <li>We use industry-standard security practices.</li>
          <li>You retain full privacy rights under Indian law.</li>
        </ul>
      </UCard>

      <!-- INFORMATION WE COLLECT -->
      <UCard class="mb-6">
        <template #header>
          <h3 class="font-semibold text-lg">Information We Collect</h3>
        </template>

        <p class="font-semibold">Personal Information</p>

        <ul class="list-disc ml-6 mt-2 space-y-1">
          <li>Name</li>
          <li>Phone number</li>
          <li>Email address</li>
          <li>Shipping & billing address</li>
          <li>Date of birth</li>
          <li>Login credentials</li>
          <li>Uploaded photos/documents</li>
          <li>Location data (if permitted)</li>
        </ul>

        <USeparator class="my-4" />

        <p class="font-semibold">Payment Data</p>

        <p class="mt-2">
          Payments are securely processed by Razorpay. We do not store card or
          banking details on our servers.
        </p>
      </UCard>

      <!-- PROCESSING -->
      <UCard class="mb-6">
        <template #header>
          <h3 class="font-semibold text-lg">How We Process Information</h3>
        </template>

        <ul class="list-disc ml-6 space-y-1">
          <li>Create and manage accounts</li>
          <li>Process orders and invoices</li>
          <li>Provide customer support</li>
          <li>Send transactional communications</li>
          <li>Improve platform performance</li>
          <li>Prevent fraud and misuse</li>
        </ul>
      </UCard>

      <!-- SHARING -->
      <UCard class="mb-6">
        <template #header>
          <h3 class="font-semibold text-lg">Sharing of Information</h3>
        </template>

        <ul class="list-disc ml-6 space-y-1">
          <li>Payment processors</li>
          <li>Cloud hosting providers</li>
          <li>Logistics & delivery partners</li>
          <li>Analytics providers</li>
        </ul>
      </UCard>

      <!-- SECURITY -->
      <UCard class="mb-6">
        <template #header>
          <h3 class="font-semibold text-lg">Security Measures</h3>
        </template>

        <p>
          We implement encryption, secure infrastructure, and access controls
          in compliance with the IT Act 2000 and DPDP Act 2023.
        </p>
      </UCard>

      <!-- RIGHTS -->
      <UCard class="mb-6">
        <template #header>
          <h3 class="font-semibold text-lg">Your Privacy Rights</h3>
        </template>

        <ul class="list-disc ml-6 space-y-1">
          <li>Right to access your data</li>
          <li>Right to correction</li>
          <li>Right to erasure</li>
          <li>Right to withdraw consent</li>
          <li>Right to grievance redressal</li>
        </ul>
      </UCard>

      <!-- GRIEVANCE -->
      <UCard>
        <template #header>
          <h3 class="font-semibold text-lg">Grievance Officer</h3>
        </template>

        <p><strong>Name:</strong> Reez</p>
        <p><strong>Email:</strong> reez@markit.co.in</p>

        <p class="mt-3">
          2nd Floor, K-tech Innovation Hub, Plama Center,<br>
          Bejai – Kapikad Rd,<br>
          Mangaluru, Karnataka – 575004
        </p>
      </UCard>

    </UContainer>

  </UPage>
</template>

<script setup>
definePageMeta({ layout: false });
</script>
<template>
    <div class="barcode-container">
      <div v-for="item in barcodes" :key="item.barcode" class="barcode-item">
        <!-- SVG for Barcode -->
        <svg :ref="el => setBarcode(el, item.barcode)"></svg>
  
        <!-- Barcode Details -->
        <div class="barcode-details">
          <div class="barcode-name">
            <p>{{ item.productName }}</p>
            <p class="barcode-dash" v-if="item.variantName"> - </p>
            <p v-if="item.variantName">{{ item.variantName }}</p>
          </div>
          <p class="barcode-info">
            <span v-if="item.color">Color: {{ item.color }}</span>
            <span v-if="item.color && item.size"> | </span>
            <span v-if="item.size">Size: {{ item.size }}</span>
          </p>
          <p class="price">Price: ${{ item.price.toFixed(2) }}</p>
        </div>
      </div>
    </div>
  
    <button @click="printLabels" class="print-button">Print Labels</button>
  </template>
  
  <script setup lang="ts">
  import { defineProps, onMounted } from "vue";
  import JsBarcode from "jsbarcode";
  
  interface BarcodeItem {
    barcode: string;
    productName: string;
    variantName?: string;
    price: number;
    color?: string | null;
    size?: string | null;
  }
  
  const props = defineProps<{ barcodes: BarcodeItem[] }>();
  
  // Function to Generate Barcode
  const setBarcode = (el: SVGElement | null, barcodeValue: string) => {
    if (el && barcodeValue) {
      JsBarcode(el, barcodeValue, {
        format: "CODE128",
        lineColor: "#000",
        width: 1.5, // Adjust for readability
        height: 40, // Adjust barcode height for label
        displayValue: true, // Show barcode number
      });
    }
  };
  
  // Print Function to Ensure Each Barcode Prints on a New Label
  const printLabels = () => {
    setTimeout(() => {
      window.print();
    }, 500); // Delay to ensure all barcodes are generated before printing
  };
  
  // Auto-generate barcodes when the component is mounted
  onMounted(() => {
    printLabels();
  });
  </script>
  
  <style scoped>
  /* Barcode Container */
  .barcode-container {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: flex-start;
  }
  
  /* Barcode Label Design */
  .barcode-item {
    width: 2in; /* Set to match the thermal label size */
    height: 2in;
    text-align: center;
    padding: 5px;
    border: 1px solid #000; /* Only for preview */
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    page-break-after: always; /* Ensures each barcode prints separately */
  }
  
  /* Barcode Details */
  .barcode-details {
    font-size: 12px;
    text-align: center;
    margin-top: 3px;
  }
  
  /* Product Name */
  .barcode-name {
    font-size: 14px;
    font-weight: bold;
  }
  
  /* Barcode Info */
  .barcode-info {
    font-size: 10px;
  }
  
  /* Price Styling */
  .price {
    font-weight: bold;
    font-size: 14px;
    margin-top: 3px;
  }
  
  /* Hide Button During Printing */
  @media print {
    .print-button {
      display: none;
    }
  
    .barcode-container {
      justify-content: flex-start;
    }
  
    .barcode-item {
      border: none;
      box-shadow: none;
      width: 2in;
      height: 2in;
    }
  }
  @page {
  size: 2in 2in; /* Set print size to 2x2 inches */
  margin: 0; /* Remove margins to fit the thermal label */
}

.barcode-item {
  width: 2in;
  height: 2in;
  text-align: center;
  padding: 5px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  page-break-after: always; /* Each barcode prints on a separate label */
}
  </style>
  
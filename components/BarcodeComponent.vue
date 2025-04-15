<template>
    <div class="barcode-container">
      <div v-for="item in barcodes" :key="item.barcode" class="barcode-item">
        <svg :ref="el => setBarcode(el, item.barcode)"></svg>
        <div class="barcode-details">
            <div class="barcode-name"><p>{{ item.productName }} </p><p class="barcode-dash" v-if="item.variantName"> - </p><p v-if="item.variantName">{{ item.variantName }}</p></div>
          <p class="barcode-info">
            <span v-if="item.color">Color: {{ item.color }}</span>
            <span v-if="item.size">Size: {{ item.size }}</span>
          </p>
          <p class="price">Price: ${{ item.sprice.toFixed(2) }}</p>
        </div>
      </div>
    </div>
  </template>
  
  <script setup lang="ts">
  import { onMounted, watch, defineProps } from "vue";
  import JsBarcode from "jsbarcode";
  
  // Define the TypeScript interface
  interface BarcodeItem {
    barcode: string;
    code?:string;
    productName: string;
    variantName: string;
    sprice: number;
    color?: string | null;
    size?: string | null;
  }
  
  // Define props
  const props = defineProps<{ barcodes: BarcodeItem[] }>();
  
  // Function to generate barcode
  const setBarcode = (el: SVGElement | null, barcodeValue: string) => {
    if (el && barcodeValue) {
      JsBarcode(el, barcodeValue, {
        format: "CODE128",
        lineColor: "#000",
        width: 2,
        height: 50,
        displayValue: true,
      });
    }
  };
  
  // Generate barcodes when the component is mounted
  onMounted(() => {
    if (props.barcodes) {
      props.barcodes.forEach((item) => setBarcode(null, item.barcode));
    }
  });
  
  // Watch for barcode updates
  watch(
    () => props.barcodes,
    () => {
      props.barcodes.forEach((item) => setBarcode(null, item.barcode));
    },
    { deep: true }
  );
  </script>
  
  <style scoped>
  .barcode-container {
    display: flex;
    flex-wrap: wrap;
    gap: 15px;
    justify-content: center;
  }
  
  .barcode-item {
    text-align: center;
    border: 1px solid #ccc;
    border-radius: 8px;
    background: #fff;
    padding: 10px;
    width: 180px;
    box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.1);
  }
  
  svg {
    width: 100%;
    height: auto;
  }
  
  .barcode-details {
    padding-top: 5px;
  }
  
 
  
  .barcode-name {
    display:flex;
    justify-content: center;
    font-size: 13px;
    color: #000;
  }
  
  .barcode-info {
    font-size: 12px;
    color: #000;
  }
  
  .price {
    font-weight: bold;
    color: #000;
    font-size: 14px;
    margin-top: 5px;
  }
  .barcode-dash{
    margin:0 3px;
  }
  </style>
  
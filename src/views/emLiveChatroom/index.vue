<template>
  <div>
    <!-- 这里是页面的主要内容 -->
    <h1>这是一个基础的Vue 3页面</h1>
  </div>
</template>

<script setup lang="ts">
// 这里是逻辑代码
import { ref } from 'vue';

// 定义一个响应式变量
const message = ref('Hello, Vue 3!');
</script>

<style scoped>
/* 这里是样式代码 */
h1 {
  color: blue;
}
</style>

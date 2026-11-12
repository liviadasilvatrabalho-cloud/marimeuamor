import fetch from 'node-fetch';

const code = '7891000100103';
const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json`;

try {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'OurLittleKitchenApp/1.0 (mariana@ourlittlekitchen.app)',
    },
  });
  
  console.log('Status:', response.status);
  const data = await response.json();
  console.log('API Status:', data.status);
  console.log('Product Name:', data.product ? data.product.product_name : 'N/A');
  console.log('Full product:', JSON.stringify(data.product, null, 2).substring(0, 500));
} catch (error) {
  console.error('Error:', error);
}
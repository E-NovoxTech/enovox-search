const params = new URLSearchParams(window.location.search);
const resultsGrid = document.getElementById('resultsGrid');
const resultsCount = document.getElementById('resultsCount');
const resultsSearchInput = document.getElementById('resultsSearchInput');
const categoryFilter = document.getElementById('categoryFilter');
const pricingFilter = document.getElementById('pricingFilter');
const productTypeFilter = document.getElementById('productTypeFilter');

// Pre-fill search box from ?query= in the URL (set by the homepage search form)
resultsSearchInput.value = params.get('query') || '';

async function loadResults() {
  const query = resultsSearchInput.value;
  const category = categoryFilter.value;

  const apiParams = new URLSearchParams();
  if (query) apiParams.set('query', query);
  if (category) apiParams.set('category', category);

  const res = await fetch(`/products/?${apiParams.toString()}`);
  let products = await res.json();

    // Pricing and product type filters applied client-side for now
  const pricing = pricingFilter.value;
  if (pricing) {
    products = products.filter(p => p.pricing === pricing);
  }

  const productType = productTypeFilter.value;
  if (productType) {
    products = products.filter(p => p.product_type === productType);
  }

  resultsCount.textContent = `${products.length} product${products.length === 1 ? '' : 's'} found`;

  if (products.length === 0) {
    resultsGrid.innerHTML = '<div class="no-results">No products match your search yet.</div>';
    return;
  }

  resultsGrid.innerHTML = products.map(p => `
    <div class="product-card">
      ${p.logo_url
  ? `<img src="${p.logo_url}" class="product-logo-img" width="40" height="40" alt="${p.name} logo" />`
  : `<div class="product-logo">${p.name.charAt(0)}</div>`}
      <h4>${p.name}</h4>
      <span class="badge">${p.category}</span>
      <p>${p.description}</p>
      <div class="product-meta">${p.pricing ?? 'Pricing not set'} • ${p.platform ?? 'Web'}</div>
      <a href="/static/product.html?id=${p.id}" class="btn-outline">View Product →</a>
    </div>
  `).join('');
}

document.getElementById('resultsSearchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  loadResults();
});

categoryFilter.addEventListener('change', loadResults);
pricingFilter.addEventListener('change', loadResults);
productTypeFilter.addEventListener('change', loadResults);

loadResults();
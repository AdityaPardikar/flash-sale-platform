import React, { useState } from 'react';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string;
  rating: number;
  reviews: number;
  inStock: boolean;
}

interface ProductListingProps {
  user: any;
}

const mockProducts: Product[] = [
  {
    id: '1',
    name: 'Apple Watch Ultra 2',
    description: 'The most rugged and capable Apple Watch yet',
    price: 799,
    category: 'Wearables',
    imageUrl: 'https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?w=400',
    rating: 4.9,
    reviews: 2341,
    inStock: true,
  },
  {
    id: '2',
    name: 'iPad Pro 12.9"',
    description: 'M2 chip, Liquid Retina XDR display',
    price: 1099,
    category: 'Tablets',
    imageUrl: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=400',
    rating: 4.8,
    reviews: 1856,
    inStock: true,
  },
  {
    id: '3',
    name: 'AirPods Pro 2',
    description: 'Up to 2x more Active Noise Cancellation',
    price: 249,
    category: 'Audio',
    imageUrl: 'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=400',
    rating: 4.7,
    reviews: 5623,
    inStock: true,
  },
  {
    id: '4',
    name: 'Samsung Galaxy S24 Ultra',
    description: 'Galaxy AI is here. Built for the AI era',
    price: 1299,
    category: 'Phones',
    imageUrl: 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=400',
    rating: 4.6,
    reviews: 983,
    inStock: true,
  },
  {
    id: '5',
    name: 'Bose QuietComfort Ultra',
    description: 'Immersive Audio with Spatial Audio',
    price: 429,
    category: 'Audio',
    imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400',
    rating: 4.5,
    reviews: 2156,
    inStock: false,
  },
  {
    id: '6',
    name: 'Nintendo Switch OLED',
    description: '7-inch OLED screen, Enhanced audio',
    price: 349,
    category: 'Gaming',
    imageUrl: 'https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?w=400',
    rating: 4.8,
    reviews: 7823,
    inStock: true,
  },
  {
    id: '7',
    name: 'GoPro Hero 12',
    description: '5.3K video, HyperSmooth 6.0',
    price: 399,
    category: 'Cameras',
    imageUrl: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=400',
    rating: 4.4,
    reviews: 1234,
    inStock: true,
  },
  {
    id: '8',
    name: 'Logitech MX Master 3S',
    description: 'Wireless Performance Mouse',
    price: 99,
    category: 'Accessories',
    imageUrl: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400',
    rating: 4.9,
    reviews: 3421,
    inStock: true,
  },
];

const categories = ['All', 'Phones', 'Tablets', 'Audio', 'Wearables', 'Gaming', 'Cameras', 'Accessories'];

const ProductCard: React.FC<{ product: Product; onAddToCart: (id: string) => void }> = ({
  product,
  onAddToCart,
}) => {
  return (
    <div className="bg-white/10 backdrop-blur-md rounded-2xl overflow-hidden border border-white/20 hover:border-purple-400/50 transition-all duration-300 hover:transform hover:scale-[1.02] group">
      <div className="relative h-48 overflow-hidden">
        <img
          src={product.imageUrl}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
        />
        {!product.inStock && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="bg-red-500 text-white px-4 py-2 rounded-full font-bold">Out of Stock</span>
          </div>
        )}
        <div className="absolute top-3 left-3 bg-white/20 backdrop-blur-sm text-white text-xs font-medium px-3 py-1 rounded-full">
          {product.category}
        </div>
      </div>

      <div className="p-5">
        <h3 className="text-white font-bold text-lg mb-1">{product.name}</h3>
        <p className="text-gray-400 text-sm mb-3">{product.description}</p>

        <div className="flex items-center space-x-2 mb-4">
          <div className="flex items-center">
            {[...Array(5)].map((_, i) => (
              <svg
                key={i}
                className={`w-4 h-4 ${i < Math.floor(product.rating) ? 'text-yellow-400' : 'text-gray-600'}`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
          </div>
          <span className="text-gray-400 text-sm">{product.rating} ({product.reviews})</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold text-white">${product.price}</span>
          <button
            onClick={() => onAddToCart(product.id)}
            disabled={!product.inStock}
            className={`px-4 py-2 rounded-xl font-medium transition-all duration-300 ${
              product.inStock
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 transform hover:scale-105'
                : 'bg-gray-600 text-gray-400 cursor-not-allowed'
            }`}
          >
            {product.inStock ? 'Add to Cart' : 'Unavailable'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ProductListing: React.FC<ProductListingProps> = ({ user }) => {
  const [products] = useState<Product[]>(mockProducts);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'price-low' | 'price-high' | 'rating'>('name');
  const [cartItems, setCartItems] = useState<string[]>([]);

  const filteredProducts = products
    .filter((product) => {
      const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;
      const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'price-low':
          return a.price - b.price;
        case 'price-high':
          return b.price - a.price;
        case 'rating':
          return b.rating - a.rating;
        default:
          return a.name.localeCompare(b.name);
      }
    });

  const handleAddToCart = (productId: string) => {
    if (!user) {
      alert('Please login to add items to cart!');
      return;
    }
    setCartItems([...cartItems, productId]);
    // Show a toast notification
    const product = products.find((p) => p.id === productId);
    console.log(`Added ${product?.name} to cart`);
  };

  return (
    <div>
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Browse Products</h1>
        <p className="text-gray-300">Explore our full catalog of premium products</p>
      </div>

      {/* Cart Badge */}
      {cartItems.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50">
          <button className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-3 rounded-full shadow-lg shadow-purple-500/25 flex items-center space-x-2 hover:from-purple-700 hover:to-blue-700 transition-all transform hover:scale-105">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="font-bold">{cartItems.length} items</span>
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 mb-8 border border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl pl-12 pr-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Category */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 appearance-none cursor-pointer"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat} className="bg-gray-900">{cat}</option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 appearance-none cursor-pointer"
          >
            <option value="name" className="bg-gray-900">Sort by Name</option>
            <option value="price-low" className="bg-gray-900">Price: Low to High</option>
            <option value="price-high" className="bg-gray-900">Price: High to Low</option>
            <option value="rating" className="bg-gray-900">Highest Rated</option>
          </select>
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap gap-2 mb-8">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
              selectedCategory === cat
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Results Count */}
      <p className="text-gray-400 mb-6">
        Showing <span className="text-white font-medium">{filteredProducts.length}</span> products
      </p>

      {/* Product Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {filteredProducts.map((product) => (
          <ProductCard key={product.id} product={product} onAddToCart={handleAddToCart} />
        ))}
      </div>

      {/* Empty State */}
      {filteredProducts.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">😔</div>
          <h3 className="text-xl font-bold text-white mb-2">No products found</h3>
          <p className="text-gray-400">Try adjusting your search or filters</p>
        </div>
      )}
    </div>
  );
};

export default ProductListing;

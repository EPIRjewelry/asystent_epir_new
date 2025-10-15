export interface Product {
    id: string;
    name: string;
    description: string;
    price: number;
    category: string;
    imageUrl: string;
    createdAt: Date;
    updatedAt: Date;
}

export class ProductModel {
    constructor(private product: Product) {}

    getProductDetails() {
        return {
            id: this.product.id,
            name: this.product.name,
            description: this.product.description,
            price: this.product.price,
            category: this.product.category,
            imageUrl: this.product.imageUrl,
            createdAt: this.product.createdAt,
            updatedAt: this.product.updatedAt,
        };
    }

    updateProductDetails(updatedProduct: Partial<Product>) {
        this.product = { ...this.product, ...updatedProduct, updatedAt: new Date() };
    }
}
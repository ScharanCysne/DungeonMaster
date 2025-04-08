#include "Vector2D.h"

Vector2D::Vector2D() {
    this->zero();
}

Vector2D::Vector2D(float x, float y) {
    this->x = x;
    this->y = y;
}

Vector2D& Vector2D::Add(const Vector2D &v) {
    this->x += v.x;
    this->y += v.y;
    return *this;
}

Vector2D& Vector2D::Subtract(const Vector2D &v) {
    this->x -= v.x;
    this->y -= v.y;
    return *this;
}

Vector2D& Vector2D::Multiply(const Vector2D &v) {
    this->x *= v.x;
    this->y *= v.y;
    return *this;
}

Vector2D& Vector2D::Divide(const Vector2D &v) {
    this->x /= v.x;
    this->y /= v.y;
    return *this;
}

Vector2D& operator+(Vector2D &v1, const Vector2D &v2) {
    return v1.Add(v2);
}

Vector2D& operator-(Vector2D &v1, const Vector2D &v2) {
    return v1.Subtract(v2);
}

Vector2D& operator*(Vector2D &v1, const Vector2D &v2) {
    return v1.Multiply(v2);
}

Vector2D& operator/(Vector2D &v1, const Vector2D &v2) {
    return v1.Divide(v2);
}

Vector2D& Vector2D::operator+=(const Vector2D &v) {
    return this->Add(v);
}

Vector2D& Vector2D::operator-=(const Vector2D &v) {
    return this->Subtract(v);
}

Vector2D& Vector2D::operator*=(const Vector2D &v) {
    return this->Multiply(v);
}

Vector2D& Vector2D::operator/=(const Vector2D &v) {
    return this->Divide(v);
}

std::ostream& operator<<(std::ostream &stream, const Vector2D &v) {
    stream << "(" << v.x << "," << v.y << ")";
    return stream;
}

Vector2D& Vector2D::operator*(const int &i) {
    Vector2D *v = new Vector2D(this->x * i, this->y * i);
    return *v;
}

Vector2D& Vector2D::operator*=(const int &i) {
    this->x *= i;
    this->y *= i;
    return *this;
}

Vector2D& Vector2D::operator/(const int &i) {
    Vector2D *v = new Vector2D(this->x / i, this->y / i);
    return *v;
}

Vector2D& Vector2D::operator/=(const int &i) {
    this->x /= i;
    this->y /= i;
    return *this;
}

Vector2D& Vector2D::zero() {
    this->x = 0.0f;
    this->y = 0.0f;
    return *this;
}

Vector2D& Vector2D::normalize() {
    float magnitude = sqrt((this->x * this->x) + (this->y * this->y));
    if (magnitude > 0) {
        this->x /= magnitude;
        this->y /= magnitude;
    } else {
        this->zero();
    }
    return *this;
}
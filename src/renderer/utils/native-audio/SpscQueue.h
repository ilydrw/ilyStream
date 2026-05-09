#pragma once
#include <atomic>
#include <vector>
#include <cstdint>
#include <algorithm>

template<typename T>
class SpscQueue {
public:
    explicit SpscQueue(size_t capacity) : capacity_(capacity), buffer_(capacity) {
        head_.store(0, std::memory_order_relaxed);
        tail_.store(0, std::memory_order_relaxed);
    }

    bool push(const T* data, size_t count) {
        size_t current_tail = tail_.load(std::memory_order_relaxed);
        size_t next_tail = (current_tail + count) % capacity_;
        
        size_t head = head_.load(std::memory_order_acquire);
        size_t occupied = (current_tail >= head) ? (current_tail - head) : (capacity_ - head + current_tail);
        
        if (occupied + count >= capacity_) {
            return false; 
        }

        for (size_t i = 0; i < count; ++i) {
            buffer_[(current_tail + i) % capacity_] = data[i];
        }

        tail_.store(next_tail, std::memory_order_release);
        return true;
    }

    size_t pop(T* out_data, size_t max_count) {
        size_t current_head = head_.load(std::memory_order_relaxed);
        size_t current_tail = tail_.load(std::memory_order_acquire);
        
        if (current_head == current_tail) return 0; 

        size_t available = (current_tail >= current_head)? 
                           (current_tail - current_head) : 
                           (capacity_ - current_head + current_tail);
                           
        size_t to_read = std::min(available, max_count);

        for (size_t i = 0; i < to_read; ++i) {
            out_data[i] = buffer_[(current_head + i) % capacity_];
        }

        head_.store((current_head + to_read) % capacity_, std::memory_order_release);
        return to_read;
    }

private:
    size_t capacity_;
    std::vector<T> buffer_;
    alignas(64) std::atomic<size_t> head_;
    alignas(64) std::atomic<size_t> tail_;
};
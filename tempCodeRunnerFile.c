#include <stdio.h>

int main() {
    int a[20] = {1, 21, 43, 54, 45, 96, 17, 38, 29, 10};
    int size = 10;

    //  Traversal
    printf("\n Traversal\n");
    for (int i = 0; i < size; i++) {
        printf("Element %d is %d\n", i, a[i]);
    }

    // Search
    printf("\nSearch\n");
    int val = 54;
    for (int i = 0; i < size; i++) {
        if (a[i] == val) {
            printf("Element %d found at index %d\n", val, i);
        }
    }

    // Max and Min
    printf("\n Min Max\n ");
    int max = a[0];
    int min = a[0];
    for (int i = 0; i < size; i++) {
        if (a[i] > max) max = a[i];
        if (a[i] < min) min = a[i];
    }
    printf("Max = %d\n", max);
    printf("Min = %d\n", min);

   // Insertion at Beginning
    printf("\nInsertion at beginning\n");
    int numb = 12;
    for (int i = size; i > 0; i--) {
        a[i] = a[i - 1];
    }
    a[0] = numb;
    size++;
    for (int i = 0; i < size; i++) {
        printf("Element %d is %d\n", i, a[i]);
    }

    // Insertion at Specific Index 
    printf("\nInsertion at index\n");
    int nump = 14;
    int pos = 3;
    for (int i = size; i > pos; i--) {
        a[i] = a[i - 1];
    }
    a[pos] = nump;
    size++;
    for (int i = 0; i < size; i++) {
        printf("Element %d is %d\n", i, a[i]);
    }

    //  Insertion at End
    printf("\nInsertion at end\n");
    int nume = 4578;
    a[size] = nume;
    size++; 
    for (int i = 0; i < size; i++) {
        printf("Element %d is %d\n", i, a[i]);
    }

    //  Deletion at Beginning
    printf("\ndeletion at beginning\n");
    for (int i = 0; i < size - 1; i++) {
        a[i] = a[i + 1];
    }
    size--; 
    for (int i = 0; i < size; i++) {
        printf("Element %d is %d\n", i, a[i]);
    }

    // Deletion at Specific Index 
    printf("\n Deletion at specific index\n");
    int posd = 4;
    if (posd >= 0 && posd < size) {
        for (int i = posd; i < size - 1; i++) {
            a[i] = a[i + 1];
        }
        size--;
    }
    for (int i = 0; i < size; i++) {
        printf("Element %d is %d\n", i, a[i]);
    }

    // Deletion at End
    printf("\nDeletion at end \n");
    if (size > 0) {
        size--; 
    }
    for (int i = 0; i < size; i++) {
        printf("Element %d is %d\n", i, a[i]);
    }

    // Sum of all elements
    printf("\nSUM\n");
    int sum = 0;
    for (int i = 0; i < size; i++) {
        sum += a[i];
    }
    printf("Sum = %d\n", sum);
    return 0;
}
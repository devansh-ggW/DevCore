import random

choices = ["rock", "paper", "scissors"]
user = input("Rock, Paper, or Scissors: ").lower()
computer = random.choice(choices)

print("Computer:", computer)

if user == computer:
    print("Draw!")
elif (user == "rock" and computer == "scissors") or (user == "paper" and computer == "rock") or (user == "scissors" and computer == "paper"):
    print("You win!")
elif user in choices:
    print("You lose!")
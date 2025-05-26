import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink}  from '@angular/router';
import { UserService } from '../../services/user.service';
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {
  isCustomer: boolean = false;
  isDriver: boolean = false;
  username: string = 'Benutzer';

  constructor(private router: Router, private userService: UserService) {}

  ngOnInit() {
    const role = localStorage.getItem('userRole');
    this.isDriver = role === 'DRIVER';
    this.isCustomer = role === 'CUSTOMER';
    this.username = localStorage.getItem('username') ?? 'Benutzer';
  }

  createRideRequest() {
    this.router.navigate(['/ride-request']);
  }

  viewProfile() {
    this.router.navigate(['/profile']);
  }
  logout() {
    localStorage.removeItem('userRole');
    localStorage.removeItem('username');
    this.router.navigate(['/login']);
  }
  searchUsers() {
    this.router.navigate(['/search'])
  }
  account() {
    this.router.navigate(['/account']);
  }
}
